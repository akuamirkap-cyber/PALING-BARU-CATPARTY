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
  | "moka"
  | "jambul";

export interface AnimalDef {
  id: AnimalId;
  name: string;
  emoji: string;
  tagline: string;
  ui: string; // css color (card background, like the poster tiles)
}

// Inspired by the "HELLO CAT" poster: 9 meme-faced cats.
export const ANIMALS: AnimalDef[] = [
  { id: "mochi", name: "Mochi", emoji: "🐱", tagline: "Polos tapi licik 😇", ui: "#2f9a6a" },
  { id: "oyen", name: "Oyen", emoji: "🐱", tagline: "Oren bar-bar 🔥", ui: "#6a5bc4" },
  { id: "siam", name: "Siam", emoji: "🐱", tagline: "Topeng misterius 🎭", ui: "#1f9bb5" },
  { id: "item", name: "Item", emoji: "🐈‍⬛", tagline: "Si hitam manis 🖤", ui: "#e08aa8" },
  { id: "loreng", name: "Loreng", emoji: "🐈", tagline: "Bapak-bapak judes 😒", ui: "#b5452f" },
  { id: "telon", name: "Telon", emoji: "🐱", tagline: "Senyum terus 😊", ui: "#2c4fb0" },
  { id: "abu", name: "Abu", emoji: "🐈", tagline: "Bocil kepo 👀", ui: "#2f3f73" },
  { id: "garong", name: "Garong", emoji: "😾", tagline: "Preman komplek 💢", ui: "#f0b13a" },
  { id: "mendung", name: "Mendung", emoji: "🐈‍⬛", tagline: "Kalem tapi bahaya 😶", ui: "#d9cfc6" },
  { id: "oreo", name: "Oreo", emoji: "🐈‍⬛", tagline: "Imut maksimal 🥺", ui: "#f4b8cc" },
  { id: "moka", name: "Moka", emoji: "🐱", tagline: "Gemoy pemalu 🌸", ui: "#f7c6d4" },
  { id: "jambul", name: "Jambul", emoji: "🧸", tagline: "Bulu piatu berjongkok 🧡", ui: "#2a8f86" },
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

export type AccessoryId =
  | "none" | "capRed" | "capBlue" | "capNewRed" | "capNewBlue" | "dolit" | "helmet" | "crown" | "shades"
  | "cowboy" | "afro" | "nerd" | "detective" | "clownnose" | "jason"
  | "belt" | "boxers" | "duckfloat" | "broom" | "gloves" | "sandal"
  | "classic" | "cool" | "pixel" | "collar" | "mallet";
export const ACCESSORIES: { id: AccessoryId; name: string; icon: string }[] = [
  { id: "none", name: "Polos", icon: "🚫" },
  { id: "capNewRed", name: "Topi Baseball Merah", icon: "🧢" },
  { id: "capNewBlue", name: "Topi Baseball Biru", icon: "🧢" },
  { id: "dolit", name: "Paman Dolit", icon: "🥸" },
  { id: "helmet", name: "Helm Fullface", icon: "⛑️" },
  { id: "crown", name: "Mahkota Raja", icon: "👑" },
  { id: "shades", name: "Kacamata Keren", icon: "🕶️" },
  { id: "cowboy", name: "Topi Koboi", icon: "🤠" },
  { id: "afro", name: "Afro Pelangi", icon: "🌈" },
  { id: "nerd", name: "Kacamata Nerds", icon: "🤓" },
  { id: "detective", name: "Kacamata Detektif", icon: "🕵️" },
  { id: "clownnose", name: "Hidung Badut", icon: "🤡" },
  { id: "jason", name: "Topeng Hockey", icon: "🥷" },
  { id: "belt", name: "Sabuk Juara", icon: "🏅" },
  { id: "boxers", name: "Celana Tinju", icon: "🩳" },
  { id: "duckfloat", name: "Pelampung Bebek", icon: "🦆" },
  { id: "broom", name: "Sapu Punggung", icon: "🧹" },
  { id: "gloves", name: "Sarung Tinju", icon: "🧤" },
  { id: "sandal", name: "Sandal Jepit", icon: "🩴" },
  { id: "classic", name: "Kacamata Klasik", icon: "🕶️" },
  { id: "cool", name: "Kacamata Wayfarer", icon: "😎" },
  { id: "pixel", name: "Kacamata Pixel", icon: "🕹️" },
  { id: "collar", name: "Kalung Lonceng", icon: "🔔" },
  { id: "mallet", name: "Palu Kayu", icon: "🔨" },
];
