const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async (event, context) => {
  const { title, body } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate'; // <-- Ditt GitHub org/brukernavn
  const REPO = 'aktiv-kommune-skjema'; // <-- Repo-navnet

  const milestoneTitle = "Innkommende feil og forslag"; // <-- Eksakt navn på milestone

  try {
    // 1. Hent alle milestones i repoet
    const milestonesResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!milestonesResponse.ok) {
      throw new Error(`Kunne ikke hente milestones: ${milestonesResponse.status}`);
    }

    const milestones = await milestonesResponse.json();
    const milestone = milestones.find(m => m.title === milestoneTitle);

    // 2. Lag ny issue
    const issueBody = {
      title: title,
      body: body,
    };

    if (milestone) {
      issueBody.milestone = milestone.number; // kobler til riktig milestone hvis funnet
    }

    const issueResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(issueBody)
    });

    if (!issueResponse.ok) {
      const errorData = await issueResponse.json();
      return {
        statusCode: issueResponse.status,
        body: JSON.stringify({ message: `Feil ved oppretting av issue: ${errorData.message}` })
      };
    }

    const data = await issueResponse.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${data.number}` })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: `Serverfeil: ${error.message}` })
    };
  }
};
