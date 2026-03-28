import 'dotenv/config';

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

async function testGitHubEvents() {
  console.log(`Testing events for user: ${username}`);
  let totalEvents = 0;
  let page = 1;
  while(page <= 10) {
    const res = await fetch(`https://api.github.com/users/${username}/events/public?page=${page}&per_page=30`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Test',
        'Accept': 'application/vnd.github+json',
      }
    });
    
    if (!res.ok) {
        console.log(`Failed page ${page}: ${res.statusText}`);
        break;
    }
    const events = await res.json();
    if (!events || events.length === 0) {
        console.log(`Page ${page} is empty.`);
        break;
    }
    
    totalEvents += events.length;
    
    const types = {};
    events.forEach(e => {
        types[e.type] = (types[e.type] || 0) + 1;
    });
    
    console.log(`Page ${page}: ${events.length} events, first: ${events[0].created_at}, last: ${events[events.length-1]?.created_at}`);
    console.log(`Types: ${JSON.stringify(types)}`);
    
    page++;
  }
  console.log(`Total events fetched: ${totalEvents}`);
}

testGitHubEvents();
