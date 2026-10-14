import { storyClosed, storyLost } from "./stories-a";
import { storyHandover, storyWarranty } from "./stories-b";
import { storyHala, storyZatepleni } from "./stories-c";
import {
  storyInquiries,
  storyNovostavba,
  storyOrdinace,
  storyPekarna,
  storyPristavba,
  storySbd,
  storyStrecha,
} from "./stories-d";
import type { World } from "./world";

export async function runStories(w: World): Promise<void> {
  // pořadí podle data první faktury, aby číslování zakázek i faktur přibližně sledovalo čas
  await storyLost(w);
  await storyWarranty(w);
  await storyClosed(w);
  await storyHandover(w);
  await storyHala(w);
  await storyZatepleni(w);
  await storyPekarna(w);
  await storyStrecha(w);
  await storyNovostavba(w);
  await storyOrdinace(w);
  await storyPristavba(w);
  await storySbd(w);
  await storyInquiries(w);
}
