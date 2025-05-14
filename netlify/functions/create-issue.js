const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async (event, context) => {
  const { title, body } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/issues`;

  const githubResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: title,
      body: body
    })
  });

  if (!githubResponse.ok) {
    const errorData = await githubResponse.json();
    return {
      statusCode: githubResponse.status,
      body: JSON.stringify({ message: `Error: ${errorData.message}` })
    };
  }

  const data = await githubResponse.json();
  return {
    statusCode: 200,
    body: JSON.stringify({ message: `Issue opprettet! Nummer: ${data.number}` })
  };
};
