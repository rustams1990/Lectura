import fs from 'fs';

try {
  const dbData = fs.readFileSync('local_server_db.json', 'utf8');
  const parsed = JSON.parse(dbData);
  
  if (parsed.lingqs) {
    const lingqKeys = Object.keys(parsed.lingqs);
    console.log("Total lingqs in DB:", lingqKeys.length);
    
    let stats = {
      nullItems: 0,
      invalidWords: 0,
      invalidCreatedAt: 0,
      invalidTags: 0,
      invalidExamples: 0,
      invalidStatus: 0,
      hasNullFields: 0,
    };
    
    const issues = [];
    
    for (const key of lingqKeys) {
      const item = parsed.lingqs[key];
      if (!item) {
        stats.nullItems++;
        issues.push({ key, issue: "Item is null/undefined" });
        continue;
      }
      
      if (typeof item.word !== 'string') {
        stats.invalidWords++;
        issues.push({ key, issue: `Word is type ${typeof item.word}` });
      }
      
      if (typeof item.createdAt !== 'number' || isNaN(item.createdAt)) {
        stats.invalidCreatedAt++;
        issues.push({ key, issue: `createdAt is ${item.createdAt} (type ${typeof item.createdAt})` });
      }
      
      if (item.tags !== undefined && item.tags !== null && !Array.isArray(item.tags)) {
        stats.invalidTags++;
        issues.push({ key, issue: `tags is not an array: ${JSON.stringify(item.tags)}` });
      }
      
      if (item.examples !== undefined && item.examples !== null && !Array.isArray(item.examples)) {
        stats.invalidExamples++;
        issues.push({ key, issue: `examples is not an array: ${JSON.stringify(item.examples)}` });
      }
      
      if (typeof item.status !== 'string') {
        stats.invalidStatus++;
        issues.push({ key, issue: `status is type ${typeof item.status}: ${JSON.stringify(item.status)}` });
      }
    }
    
    console.log("Validation stats:", stats);
    if (issues.length > 0) {
      console.log("Found issues:", JSON.stringify(issues.slice(0, 50), null, 2));
    } else {
      console.log("No structural issues found in lingqs.");
    }

    // Let's also check wordLinks (aliases)
    if (parsed.wordLinks) {
      console.log("Total wordLinks:", Object.keys(parsed.wordLinks).length);
      const invalidLinks = [];
      for (const [k, v] of Object.entries(parsed.wordLinks)) {
        if (typeof k !== 'string' || typeof v !== 'string') {
          invalidLinks.push({ k, v });
        }
      }
      console.log("Invalid wordLinks:", invalidLinks.length);
      if (invalidLinks.length > 0) {
        console.log("Sample invalid wordLinks:", invalidLinks.slice(0, 10));
      }
    }
  }
} catch (err) {
  console.error(err);
}
