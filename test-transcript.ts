import { YoutubeTranscript } from "youtube-transcript";
async function test() {
  const t = await YoutubeTranscript.fetchTranscript("dQw4w9WgXcQ");
  console.log(t[0], t[1]);
  console.log(t[t.length - 1]);
}
test();
