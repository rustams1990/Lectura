import fetch from "node-fetch";

async function getCaptionTracksFromInvidious(videoId: string) {
  const instances = [
    "invidious.lunar.icu",
    "yewtu.be",
    "invidious.projectsegfau.lt",
    "iv.melmac.space",
    "invidious.io.lol",
    "invidious.asir.dev",
    "invidious.perennialte.ch",
    "invidious.privacydev.net",
    "iv.ggtyler.dev"
  ];

  for (const host of instances) {
    const url = `https://${host}/api/v1/captions/${videoId}`;
    console.log(`Trying ${host}...`);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 4000
      } as any);
      if (resp.status === 200) {
        const data = await resp.json() as any;
        if (data?.captionTracks && Array.isArray(data.captionTracks) && data.captionTracks.length > 0) {
          // Normalize the baseUrl to be absolute
          const tracks = data.captionTracks.map((t: any) => {
            let baseUrl = t.baseUrl;
            if (!baseUrl.startsWith("http")) {
              baseUrl = `https://${host}${baseUrl}`;
            }
            return {
              ...t,
              baseUrl
            };
          });
          return { tracks, host };
        }
      } else {
        console.log(`  ${host} returned status ${resp.status}`);
      }
    } catch (e: any) {
      console.log(`  ${host} failed: ${e.message}`);
    }
  }
  return null;
}

async function run() {
  const videoId = "mXrRQ5fMWHw";
  console.log("Starting Invidious call...");
  const result = await getCaptionTracksFromInvidious(videoId);
  if (result) {
    console.log(`\nSUCCESS! Found captions on host: ${result.host}`);
    console.log(`Tracks count: ${result.tracks.length}`);
    console.log("Tracks list:");
    console.log(JSON.stringify(result.tracks, null, 2));
    
    // Test downloading Italian captions of this video
    const itTrack = result.tracks.find((t: any) => t.languageCode === "it") || result.tracks[0];
    console.log(`Downloading track: ${itTrack.name} (${itTrack.languageCode})`);
    
    const subResp = await fetch(itTrack.baseUrl);
    const subText = await subResp.text();
    console.log(`Fetch status: ${subResp.status}`);
    console.log("Subtitle content preview:");
    console.log(subText.substring(0, 500));
  } else {
    console.log("\nFAILED! No host had active captions for this video.");
  }
}

run();
