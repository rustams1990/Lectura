import fs from 'fs';

// Helper functions copied from morphology / contextSearch / utils if needed
function resolveWordToPattern(word) {
  // simple mock or replace with real logic if needed
  return word.toLowerCase(); 
}

try {
  const dbData = fs.readFileSync('local_server_db.json', 'utf8');
  const parsed = JSON.parse(dbData);
  
  const lingqs = parsed.lingqs || {};
  const lessons = parsed.lessons || [];
  const listeningSeconds = parsed.listeningSeconds || 0;
  const wordLinks = parsed.wordLinks || {};

  console.log("Database loaded.");
  
  // 1. languagesList
  console.log("Simulating languagesList...");
  const langs = new Set();
  Object.keys(lingqs).forEach((key) => {
    const parts = key.split("_");
    const langName = parts.length > 1 ? parts[0] : "spanish";
    langs.add(langName.charAt(0).toUpperCase() + langName.slice(1).toLowerCase());
  });

  const languagesList = Array.from(langs).filter((lang) => {
    const count = Object.entries(lingqs).filter(([key]) => {
      const parts = key.split("_");
      const itemLang = parts.length > 1 ? parts[0] : "spanish";
      return itemLang.toLowerCase() === lang.toLowerCase();
    }).length;
    return count > 0;
  });
  console.log("languagesList:", languagesList);

  const selectedStatsLang = lessons[0]?.targetLanguage || languagesList[0] || "Spanish";
  console.log("selectedStatsLang:", selectedStatsLang);

  // 2. lingqArray
  console.log("Simulating lingqArray...");
  const lingqArray = Object.entries(lingqs)
    .filter(([key, lq]) => {
      if (!lq || typeof lq !== "object") return false;
      if (typeof lq.word !== "string" || !lq.word.trim()) return false;
      if (lq.translation !== undefined && lq.translation !== null && typeof lq.translation !== "string") return false;
      const parts = key.split("_");
      const itemLang = parts.length > 1 ? parts[0] : "spanish";
      return itemLang.toLowerCase() === selectedStatsLang.toLowerCase();
    })
    .map(([_, lq]) => lq);
  console.log("lingqArray length:", lingqArray.length);

  // 3. statsArray
  console.log("Simulating statsArray (onlyPatterns = false)...");
  let statsArray = lingqArray;
  console.log("statsArray length (onlyPatterns = false):", statsArray.length);

  console.log("Simulating statsArray (onlyPatterns = true)...");
  const grouped = new Map();
  lingqArray.forEach((item) => {
    const resolved = resolveWordToPattern(item.word);
    const existing = grouped.get(resolved);

    if (!existing) {
      grouped.set(resolved, {
        ...item,
        word: resolved,
      });
    } else {
      const getStatusWeight = (status) => {
        switch (status) {
          case "known": return 6;
          case "5": return 5;
          case "4": return 4;
          case "3": case "learning": return 3;
          case "2": return 2;
          case "1": return 1;
          case "ignored": return 0;
          default: return 0;
        }
      };
      const useNewer = getStatusWeight(item.status) > getStatusWeight(existing.status);

      let mergedTranslation = existing.translation;
      if (item.translation && item.translation !== existing.translation) {
        if (!existing.translation.toLowerCase().includes(item.translation.toLowerCase()) &&
            !item.translation.toLowerCase().includes(existing.translation.toLowerCase())) {
          mergedTranslation = existing.translation + " | " + item.translation;
        }
      }

      grouped.set(resolved, {
        ...(useNewer ? item : existing),
        word: resolved,
        translation: mergedTranslation,
        createdAt: Math.max(existing.createdAt || 0, item.createdAt || 0),
      });
    }
  });
  const statsArrayPatterns = Array.from(grouped.values());
  console.log("statsArray length (onlyPatterns = true):", statsArrayPatterns.length);

  // 4. heatmapData
  console.log("Simulating heatmapData...");
  const dailyCounts = {};
  statsArray.forEach((item) => {
    if (!item.createdAt) return;
    const dateObj = new Date(item.createdAt);
    if (isNaN(dateObj.getTime())) return;
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    if (!dailyCounts[dateStr]) {
      dailyCounts[dateStr] = { added: 0, words: [] };
    }
    dailyCounts[dateStr].added += 1;
    dailyCounts[dateStr].words.push(item.word);
  });

  const cells = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + daysToSunday);
  
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 167);
  
  const tempDate = new Date(startDate);
  for (let i = 0; i < 168; i++) {
    const year = tempDate.getFullYear();
    const month = String(tempDate.getMonth() + 1).padStart(2, '0');
    const day = String(tempDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dayData = dailyCounts[dateStr] || { added: 0, words: [] };
    cells.push({
      dateStr,
      date: new Date(tempDate),
      count: dayData.added,
      words: dayData.words
    });
    tempDate.setDate(tempDate.getDate() + 1);
  }

  const columns = [];
  for (let c = 0; c < 24; c++) {
    const column = [];
    for (let r = 0; r < 7; r++) {
      column.push(cells[c * 7 + r]);
    }
    columns.push(column);
  }

  const activeDays = Object.keys(dailyCounts).length;
  const maxInADay = Object.values(dailyCounts).reduce((max, d) => Math.max(max, d.added), 0);
  
  const sortedDates = Object.keys(dailyCounts).sort();
  let longestStreak = 0;
  let currentStreak = 0;

  if (sortedDates.length > 0) {
    const dateSet = new Set(sortedDates);
    let tempStreak = 0;
    
    const scanDate = new Date(startDate);
    scanDate.setHours(0,0,0,0);
    const endScan = new Date(today);
    endScan.setHours(0,0,0,0);
    
    while (scanDate <= endScan) {
      const y = scanDate.getFullYear();
      const m = String(scanDate.getMonth() + 1).padStart(2, '0');
      const d = String(scanDate.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${d}`;
      
      if (dateSet.has(ds)) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
      scanDate.setDate(scanDate.getDate() + 1);
    }
    
    const checkDate = new Date(today);
    checkDate.setHours(0,0,0,0);
    let finished = false;
    while (!finished) {
      const y = checkDate.getFullYear();
      const m = String(checkDate.getMonth() + 1).padStart(2, '0');
      const d = String(checkDate.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${d}`;
      
      if (dateSet.has(ds)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (currentStreak === 0) {
          const yesterday = new Date(today);
          yesterday.setHours(0,0,0,0);
          yesterday.setDate(today.getDate() - 1);
          
          const yy = yesterday.getFullYear();
          const ym = String(yesterday.getMonth() + 1).padStart(2, '0');
          const yd = String(yesterday.getDate()).padStart(2, '0');
          const yds = `${yy}-${ym}-${yd}`;
          
          if (dateSet.has(yds)) {
            let yStreak = 0;
            const yCheck = new Date(yesterday);
            while (dateSet.has(`${yCheck.getFullYear()}-${String(yCheck.getMonth() + 1).padStart(2, '0')}-${String(yCheck.getDate()).padStart(2, '0')}`)) {
              yStreak++;
              yCheck.setDate(yCheck.getDate() - 1);
            }
            currentStreak = yStreak;
          }
        }
        finished = true;
      }
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }
  console.log("heatmapData columns count:", columns.length);
  console.log("longestStreak:", longestStreak, "currentStreak:", currentStreak);

  // 5. monthlyGrowth
  console.log("Simulating monthlyGrowth...");
  const monthlyGrowth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthLabel = d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
    
    const endOfMonthMax = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const totalWordsByThen = statsArray.filter(item => item.createdAt && item.createdAt <= endOfMonthMax).length;
    
    monthlyGrowth.push({
      name: monthLabel,
      count: totalWordsByThen
    });
  }
  console.log("monthlyGrowth:", monthlyGrowth);

  // 6. vocabTags
  console.log("Simulating vocabTags...");
  const tagsSet = new Set();
  statsArray.forEach((item) => {
    if (item.tags) {
      item.tags.forEach((tag) => {
        if (tag && tag.trim()) {
          tagsSet.add(tag.trim().toLowerCase());
        }
      });
    }
  });
  const vocabTags = Array.from(tagsSet).sort();
  console.log("vocabTags length:", vocabTags.length);

  // 7. filteredVocabularyList
  console.log("Simulating filteredVocabularyList...");
  const vocabSearch = "";
  const vocabFilter = "all";
  const vocabTagFilter = "all";
  const vocabLengthFilter = "all";
  const filteredVocabularyList = statsArray.filter((item) => {
    if (!item) return false;
    const wordStr = typeof item.word === "string" ? item.word : "";
    const transStr = typeof item.translation === "string" ? item.translation : "";
    const grammarStr = typeof item.grammar === "string" ? item.grammar : "";

    const matchesSearch = 
      wordStr.toLowerCase().includes(vocabSearch.toLowerCase()) ||
      transStr.toLowerCase().includes(vocabSearch.toLowerCase()) ||
      grammarStr.toLowerCase().includes(vocabSearch.toLowerCase());

    const matchesFilter = (() => {
      if (vocabFilter === "all") {
        return item.status !== "ignored"; 
      }
      return true;
    })();

    const matchesTag = (() => {
      if (vocabTagFilter === "all") return true;
      return !!(item.tags && Array.isArray(item.tags) && item.tags.some(t => typeof t === "string" && t.toLowerCase() === vocabTagFilter.toLowerCase()));
    })();

    return matchesSearch && matchesFilter && matchesTag;
  });
  console.log("filteredVocabularyList length:", filteredVocabularyList.length);

  console.log("ALL SIMULATIONS COMPLETED SUCCESSFULLY WITHOUT ERROR!");
} catch (err) {
  console.error("CRASH DETECTED IN SIMULATION:", err);
}
