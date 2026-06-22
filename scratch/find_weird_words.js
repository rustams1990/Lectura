import fs from 'fs';

try {
  const dbData = fs.readFileSync('local_server_db.json', 'utf8');
  const parsed = JSON.parse(dbData);
  
  if (parsed.lingqs) {
    const keys = Object.keys(parsed.lingqs);
    console.log("Analyzing keys... Total:", keys.length);
    
    let weirdKeys = [];
    for (const key of keys) {
      const item = parsed.lingqs[key];
      if (!item) continue;
      
      // Check for special characters in word or key
      if (/[\n\r\t]/.test(key) || /[\n\r\t]/.test(item.word)) {
        weirdKeys.push({ key, word: item.word, reason: "Contains newline/tab" });
      }
      
      if (item.word.length > 50) {
        weirdKeys.push({ key, word: item.word, reason: "Word is very long: " + item.word.length });
      }
      
      if (!item.status) {
        weirdKeys.push({ key, word: item.word, reason: "Status is missing/empty" });
      }
      
      if (item.status && !["known", "ignored", "1", "2", "3", "4", "5", "learning"].includes(item.status)) {
        weirdKeys.push({ key, word: item.word, reason: "Status is invalid: " + item.status });
      }
    }
    
    console.log("Weird keys found:", weirdKeys.length);
    if (weirdKeys.length > 0) {
      console.log(JSON.stringify(weirdKeys.slice(0, 50), null, 2));
    } else {
      console.log("No weird keys found by this criteria.");
    }
  }
} catch (err) {
  console.error(err);
}
