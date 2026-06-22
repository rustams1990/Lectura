import fs from 'fs';

try {
  const dbData = fs.readFileSync('local_server_db.json', 'utf8');
  const parsed = JSON.parse(dbData);
  
  if (parsed.lingqs) {
    const keys = Object.keys(parsed.lingqs);
    let invalidDates = [];
    for (const key of keys) {
      const item = parsed.lingqs[key];
      if (item) {
        const d = new Date(item.createdAt);
        if (isNaN(d.getTime())) {
          invalidDates.push({ key, createdAt: item.createdAt });
        }
      }
    }
    console.log("Invalid dates count:", invalidDates.length);
    if (invalidDates.length > 0) {
      console.log("Sample invalid dates:", invalidDates.slice(0, 10));
    }
  }
} catch (err) {
  console.error(err);
}
