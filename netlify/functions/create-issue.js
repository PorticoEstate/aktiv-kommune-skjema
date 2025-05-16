const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
import { get, set } from '@netlify/kv';

exports.handler = async (event, context) => {
  const { title, description, category, role, contact } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';

  // Rate limit per dag
  const dateKey = new Date().toISOString().split('T')[0];
  const rateKey = `rate-limit-${dateKey}`;
  const count = (await get(rateKey)) || 0;

  if (count >= 100) {
    return {
      statusCode: 429,
      body: JSON.stringify({ message: 'Maksimalt antall innsendinger for i dag er nådd.' }),
    };
  }

  try {
    // Finn milestone
    const milestoneRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    const milestones = await milestoneRes.json();
    const milestone = milestones.find(m => m.title === MILESTONE_NAME);

    if (!milestone) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" not found.` }),
      };
    }

    // Lag GitHub issue
    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: `## Beskrivelse\n${description}\n\n## Din rolle\n${role}\n\n## Sendt inn av\n${contact || ''}`,
        milestone: milestone.number,
        labels: [category],
      }),
    });

    const issue = await issueRes.json();

    if (!issue.number) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Feil ved oppretting av issue.', error: issue }),
      };
    }

    // Legg til i prosjektet
    const projectRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation {
            addProjectV2ItemById(input: {projectId: "${PROJECT_ID}", contentId: "${issue.node_id}"}) {
              item {
                id
              }
            }
          }
        `,
      }),
    });

    const projectData = await projectRes.json();

    if (projectData.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue opprettet, men kunne ikke legges til prosjekt.', errors: projectData.errors }),
      };
    }

    // Oppdater teller for dagen
    await set(rateKey, count + 1, { expirationTtl: 86400 }); // Utløper etter 24t

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issue.number}` }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Serverfeil', error: error.message }),
    };
  }
};
