import { readFileSync } from 'fs';

// Load .env manually
const envContent = readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

console.log('Username:', username);
console.log('Token present:', !!token);

// Test raw GitHub Events API
for (let page = 1; page <= 5; page++) {
  const res = await fetch(`https://api.github.com/users/${username}/events/public?page=${page}&per_page=30`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Test',
      'Accept': 'application/vnd.github+json',
    },
  });
  const events = await res.json();
  
  if (!Array.isArray(events) || events.length === 0) {
    console.log(`Page ${page}: EMPTY - stopping`);
    break;
  }
  
  const typeCounts = {};
  for (const ev of events) {
    const label = ev.type === 'CreateEvent' ? `Create(${ev.payload?.ref_type})` : ev.type;
    typeCounts[label] = (typeCounts[label] || 0) + 1;
  }
  
  const firstDate = events[0]?.created_at?.slice(0, 10);
  const lastDate = events.at(-1)?.created_at?.slice(0, 10);
  
  console.log(`\nPage ${page}: ${events.length} raw events | ${firstDate} to ${lastDate}`);
  console.log('  Types:', JSON.stringify(typeCounts));
  
  // Show first few events for detail
  if (page === 1) {
    for (const ev of events.slice(0, 5)) {
      const pushCommits = ev.payload?.commits?.length || 0;
      console.log(`  > ${ev.type} | ${ev.created_at} | ${ev.repo?.name} | pushCommits:${pushCommits}`);
    }
  }
  
  if (events.length < 30) {
    console.log(`Page ${page}: only ${events.length} events, no more pages.`);
    break;
  }
}
