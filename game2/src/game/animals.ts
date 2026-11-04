export type AnimalId =
  | "mochi"
  | "oyen"
  | "siam"
  | "item"
  | "loreng"
  | "telon"
  | "abu"
  | "garong"
  | "mendung"
  | "oreo"
  | "moka";

export interface AnimalDef {
  id: AnimalId;
  name: string;
  emoji: string;
  tagline: string;
  ui: string; // css color (card background, like the poster tiles)
}

// Inspired by the "HELLO CAT" poster: 9 meme-faced cats.
export const ANIMALS: AnimalDef[] = [
  { id: "mochi", name: "Mochi", emoji: "🐱", tagline: "Polos tapi licik", ui: "#2f9a6a" },
  { id: "oyen", name: "Oyen", emoji: "🐱", tagline: "Oren bar-bar", ui: "#6a5bc4" },
  { id: "siam", name: "Siam", emoji: "🐱", tagline: "Topeng misterius", ui: "#1f9bb5" },
  { id: "item", name: "Item", emoji: "🐈‍⬛", tagline: "Si hitam manis", ui: "#e08aa8" },
  { id: "loreng", name: "Loreng", emoji: "🐈", tagline: "Bapak-bapak judes", ui: "#b5452f" },
  { id: "telon", name: "Telon", emoji: "🐱", tagline: "Senyum terus", ui: "#2c4fb0" },
  { id: "abu", name: "Abu", emoji: "🐈", tagline: "Bocil kepo", ui: "#2f3f73" },
  { id: "garong", name: "Garong", emoji: "😾", tagline: "Preman komplek", ui: "#f0b13a" },
  { id: "mendung", name: "Mendung", emoji: "🐈‍⬛", tagline: "Kalem tapi bahaya", ui: "#d9cfc6" },
  { id: "oreo", name: "Oreo", emoji: "🐈‍⬛", tagline: "Imut maksimal", ui: "#f4b8cc" },
  { id: "moka", name: "Moka", emoji: "🐱", tagline: "Gemoy pemalu", ui: "#f7c6d4" },
];

export const animalById = (id: AnimalId) => ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];

export const BOT_NAMES = [
  "KamerOn4",
  "Player927016",
  "Ajsix",
  "Fuzzi",
  "CommanDX",
  "Mochi88",
  "BonkKing",
  "Wobbly",
  "Gembul",
  "Si Tengil",
];

export type AccessoryId = "none" | "capRed" | "capBlue" | "capSportRed" | "capSportBlue" | "dolit" | "helmet";
export const ACCESSORIES: { id: AccessoryId; name: string; icon: string }[] = [
  { id: "none", name: "Polos", icon: "🚫" },
  { id: "capRed", name: "Topi Merah", icon: "🧢" },
  { id: "capBlue", name: "Topi Biru", icon: "🧢" },
  { id: "capSportRed", name: "Sport Merah", icon: "🧢" },
  { id: "capSportBlue", name: "Sport Biru", icon: "🧢" },
  { id: "dolit", name: "Paman Dolit", icon: "🥸" },
  { id: "helmet", name: "Helm Fullface", icon: "⛑️" },
];
