const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

exports.handler = async (event) => {
  console.log("Deploy trigger"); // for å sikre redeploy

  const { title, body, label } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';

  try {
    // 1. Hent tilgjengelige milestones
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

    // 2. Opprett issue med label og milestone
    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        labels: [label],
        milestone: milestone.number
      }),
    });

    const issue = await issueRes.json();

    if (!issue.node_id) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue not created.', error: issue }),
      };
    }

    // 3. Legg til issue i GitHub-prosjektet
    const projectAddRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation {
            addProjectV2ItemById(input: {
              projectId: "${PROJECT_ID}",
              contentId: "${issue.node_id}"
            }) {
              item {
                id
              }
            }
          }
        `,
      }),
    });

    const projectAddData = await projectAddRes.json();

    if (projectAddData.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue created, but failed to add to project.', errors: projectAddData.errors }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issue.number}` }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Server error.', error: error.message }),
    };
  }
};
