const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { get, set } = require('@netlify/kv');

exports.handler = async (event) => {
  const { title, body, label, role, contact, url } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';
  const KV_KEY = 'daily_submission_count';

  try {
    // 🔒 Rate limiting – max 100 issues per dag
    const today = new Date().toISOString().split('T')[0];
    const kvKey = `${KV_KEY}_${today}`;
    const currentCount = (await get(kvKey)) || 0;

    if (currentCount >= 100) {
      return {
        statusCode: 429,
        body: JSON.stringify({ message: 'Daglig grense på 100 innsendinger er nådd.' }),
      };
    }

    // 🔍 Hent milestone
    const milestoneRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const milestones = await milestoneRes.json();
    const milestone = milestones.find((m) => m.title === MILESTONE_NAME);
    if (!milestone) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" not found.` }),
      };
    }

    // 📝 Lag markdown-basert body med headings
    const markdownBody = `
## Beskrivelse
${body}

## Din rolle
${role}

${url ? `## Relevant lenke\n${url}` : ''}

${contact ? `## Sendt inn av\n${contact}` : ''}
`.trim();

    // 🐛 Opprett GitHub issue
    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: markdownBody,
        milestone: milestone.number,
        labels: [label],
      }),
    });

    const issue = await issueRes.json();
    if (!issue.number) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue kunne ikke opprettes.', error: issue }),
      };
    }

    // 📌 Legg til i GitHub-prosjektet
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

    const projectResult = await projectAddRes.json();
    if (projectResult.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Issue opprettet, men kunne ikke legges til i prosjekt.',
          errors: projectResult.errors,
        }),
      };
    }

    // 📈 Oppdater Netlify KV
    await set(kvKey, currentCount + 1, { expirationTtl: 86400 });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet: #${issue.number}` }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Uventet serverfeil', error: error.message }),
    };
  }
};
