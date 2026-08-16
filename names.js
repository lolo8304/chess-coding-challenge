const SwissGermanEnglishFirstNames = [
  "Luca",
  "Noah",
  "Leon",
  "Elias",
  "Matteo",
  "Nico",
  "Jonas",
  "Liam",
  "Finn",
  "Ben",
  "Luis",
  "Julian",
  "David",
  "Samuel",
  "Tim",
  "Jan",
  "Fabian",
  "Marco",
  "Lukas",
  "Simon",
  "Florian",
  "Max",
  "Paul",
  "Felix",
  "Henry",
  "Oscar",
  "Oliver",
  "James",
  "William",
  "Thomas",
  "George",
  "Arthur",
  "Jack",
  "Harry",
  "Charlie",
  "Daniel",
  "Michael",
  "Jacob",
  "Alexander",
  "Benjamin",
  "Mia",
  "Emma",
  "Lina",
  "Sofia",
  "Lea",
  "Emilia",
  "Lena",
  "Anna",
  "Laura",
  "Nina",
  "Elena",
  "Clara",
  "Mila",
  "Lara",
  "Sarah",
  "Julia",
  "Alina",
  "Amelie",
  "Marie",
  "Sophie",
  "Hannah",
  "Luisa",
  "Maja",
  "Greta",
  "Ida",
  "Ella",
  "Charlotte",
  "Olivia",
  "Amelia",
  "Isla",
  "Ava",
  "Grace",
  "Emily",
  "Florence",
  "Jessica",
  "Alice",
  "Sophia",
  "Victoria",
  "Elizabeth",
  "Abigail",
  "Adrian",
  "Raphael",
  "Dominik",
  "Philipp",
  "Tobias",
  "Moritz",
  "Johannes",
  "Sebastian",
  "Christian",
  "Patrick",
  "Stefan",
  "Andreas",
  "Martin",
  "Peter",
  "Robert",
  "Edward",
  "Joseph",
  "Isaac",
  "Freddie",
  "Theo",
];

let chessUserName;

function generateChessUserName() {
  const name =
    SwissGermanEnglishFirstNames[
      Math.floor(Math.random() * SwissGermanEnglishFirstNames.length)
    ];
  const suffix = Math.floor(Math.random() * (9999 - 1111 + 1)) + 1111;
  return `${name}${suffix}`;
}

function getChessUserName() {
  const storageKey = "chessUserName";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    chessUserName = existing;
    return existing;
  }
  const userName = generateChessUserName();
  window.localStorage.setItem(storageKey, userName);
  chessUserName = userName;
  return userName;
}

function ensureChessUserName() {
  if (!chessUserName) {
    chessUserName = getChessUserName();
  }
  return chessUserName;
}

function setChessUserName(userName) {
  chessUserName = userName;
  window.localStorage.setItem("chessUserName", userName);
  return chessUserName;
}
