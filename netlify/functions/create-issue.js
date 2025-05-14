const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const OWNER = 'PorticoEstate';
const REPO = 'aktiv-kommune-skjema';
const ORG = 'PorticoEstate'; // organisasjon
const PROJECT_NUMBER = 2; // fra URL (https://github.com/orgs/PorticoEstate/projects/2/views/1)
const MILESTONE_NAME = '📥 Innkommende feil og forslag';

exports.handler = async (event) => {
  try {
    const { title, body } = JSON.parse(event.body);
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Missing GitHub token.' }),
      };
    }

    // 1. Finn Milestone ID
    const milestonesResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    const milestones = await milestonesResponse.json();
    const milestone = milestones.find(m => m.title === MILESTONE_NAME);

    if (!milestone) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Milestone not found.' }),
      };
    }

    // 2. Opprett Issue med milestone
    const createIssueResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        milestone: milestone.number,
      }),
    });

    if (!createIssueResponse.ok) {
      const errorData = await createIssueResponse.json();
      return {
        statusCode: createIssueResponse.status,
        body: JSON.stringify({ message: `Error creating issue: ${errorData.message}` }),
      };
    }

    const issueData = await createIssueResponse.json();

    // 3. Finn Project ID via GraphQL
    const projectQuery = `
      query {
        organization(login: "${ORG}") {
          projectV2(number: ${PROJECT_NUMBER}) {
            id
          }
        }
      }
    `;

    const projectResponse = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: projectQuery }),
    });

    const projectResult = await projectResponse.json();
    const projectId = projectResult.data.organization.projectV2.id;

    // 4. Legg til Issue i Project via GraphQL
    const addToProjectMutation = `
      mutation {
        addProjectV2ItemById(input: {projectId: "${projectId}", contentId: "${issueData.node_id}"}) {
          item {
            id
          }
        }
      }
    `;

    await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: addToProjectMutation }),
    });

    // 5. Ferdig - returner suksess
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issueData.number}` }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: `Server error: ${error.message}` }),
    };
  }
};
