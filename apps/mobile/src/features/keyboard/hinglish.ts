/** Tiny local language-ID heuristic for the in-app typing pad (PLAN §6b fallback). Not the on-device model. */
export type Lang = 'en' | 'hi';
export interface Token {
  text: string;
  lang: Lang;
}

const HINGLISH = new Set(
  (
    'hai hain hoon ho tha thi the nahi nahin nai kya kyun kyu kaise kaisa kab kahan kaun kitna ' +
    'mai main mera meri mere tum tumhara aap aapka hum humara tera teri tere ye yeh wo woh ' +
    'abhi aaj kal bhai yaar dost accha acha theek thik bahut bohot bahot bas chalo chal ' +
    'karo karna kar raha rahi rahe gaya gayi gaye aana jana milte milna bolo bata batao ' +
    'sab kuch koi aur lekin par toh to bhi hi na haan ji arre abe sunn suno dekho ' +
    'khana pani ghar paas door jaldi der lagta lagti mat pata samajh'
  ).split(' '),
);

const DEVANAGARI = /[ऀ-ॿ]/;

export function classifyWord(word: string): Lang {
  if (DEVANAGARI.test(word)) return 'hi';
  return HINGLISH.has(word.toLowerCase().replace(/[^a-z]/g, '')) ? 'hi' : 'en';
}

export function tokenize(input: string): Token[] {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, lang: classifyWord(text) }));
}
