import fetch from 'node-fetch';
import { get, set } from '@netlify/kv';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'PorticoEstate';
const REPO = 'aktiv-kommune-skjema';
const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
const MILESTONE_NAME = 'Innkommende feil og forslag';
const DAILY_LIMIT = 100;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const now = new Date();
  const key = `feedback-submissions-${now.toISOString().slice(0, 10)}`;

  try {
    const currentCount = (await get(key)) || 0;
    if (currentCount >= DAILY_LIMIT) {
      return {
        statusCode: 429,
        body: JSON.stringify({ message: 'Daglig grense nådd. Prøv igjen i morgen.' }),
      };
    }

    const { title, description, category, role, email, url } = JSON.parse(event.body);

    // Valider obligatoriske felt
    if (!title || !description || !category || !role) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Manglende obligatoriske felter.' }),
      };
    }

    // 1. Hent milestone-ID
    const milestoneRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
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

    // 2. Opprett issue
    const issueBody = `## Beskrivelse\n${description}\n\n## Din rolle\n${role}\n\n## Kontaktinformasjon\n${email || 'Ikke oppgitt'}\n\n## Feiladresse\n${url || 'Ikke oppgitt'}`;

    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
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

    // 3. Legg til i prosjekt
    const projectAddRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation {
            addProjectV2ItemById(input: {
              projectId: "${PROJECT_ID}",
              contentId: "${issue.node_id}"
            }) {
              item { id }
            }
          }
        `,
      }),
    });

    const projectAddData = await projectAddRes.json();
    if (projectAddData.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Issue opprettet, men kunne ikke legges til i prosjekt.',
          errors: projectAddData.errors,
        }),
      };
    }

    // 4. Oppdater teller
    await set(key, currentCount + 1, { ttl: 86400 });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue #${issue.number} opprettet.` }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Serverfeil.', error: error.message }),
    };
  }
};
