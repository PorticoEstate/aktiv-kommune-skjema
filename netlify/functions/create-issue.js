const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async (event, context) => {
  const { title, body } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOHVOdmc4AdXB3'; // <- Project v2 ID (forklarer under)
  const MILESTONE_TITLE = 'Innkommende feil og forslag'; // uten emoji nå!

  const apiUrl = 'https://api.github.com/graphql';

  // Hjelpefunksjon for GraphQL
  async function graphql(query, variables) {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await res.json();
    if (data.errors) {
      throw new Error(JSON.stringify(data.errors));
    }
    return data.data;
  }

  try {
    // Finn riktig milestone-ID
    const milestonesResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      }
    });
    const milestones = await milestonesResponse.json();
    const milestone = milestones.find(m => m.title === MILESTONE_TITLE);
    if (!milestone) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Milestone not found' }),
      };
    }

    // Opprett issue
    const createIssueResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        body,
        milestone: milestone.number,
      })
    });

    const createdIssue = await createIssueResponse.json();
    if (!createIssueResponse.ok) {
      return {
        statusCode: createIssueResponse.status,
        body: JSON.stringify({ message: `Error: ${createdIssue.message}` })
      };
    }

    // Legg issue inn i prosjektet (Project v2)
    const mutation = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
          item {
            id
          }
        }
      }
    `;

    await graphql(mutation, {
      projectId: PROJECT_ID,
      contentId: createdIssue.node_id, // NB: ikke issue number, men node_id
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${createdIssue.number}` }),
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: `Feil: ${error.message}` }),
    };
  }
};
