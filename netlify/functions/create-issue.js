const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

exports.handler = async (event) => {
  const { title, description, category, role, contact, url } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';

  try {
    // Hent tilgjengelige milestones
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

    const fullDescription = `## Beskrivelse\n${description}\n\n## Din rolle\n${role}\n${
      contact ? `\n## Sendt inn av\n${contact}` : ''
    }${url ? `\n\n## Lenke til side der feilen oppstår\n${url}` : ''}`;

    // Opprett issue
    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: fullDescription,
        labels: [category],
        milestone: milestone.number,
      }),
    });

    const issue = await issueRes.json();

    if (!issue.number) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Failed to create issue.', error: issue }),
      };
    }

    // Legg til i GitHub-prosjekt
    const projectAddRes = await fetch('https://api.github.com/graphql', {
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

    const projectAddData = await projectAddRes.json();

    if (projectAddData.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue created but failed to add to project.', errors: projectAddData.errors }),
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
