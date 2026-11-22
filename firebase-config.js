const firebaseConfig = {
  apiKey: "AIzaSyAb_O5yyWwlurcBfii7itQFx2yvJhBRH6U",
  authDomain: "elec114-sbs.firebaseapp.com",
  databaseURL: "https://elec114-sbs-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "elec114-sbs",
  storageBucket: "elec114-sbs.firebasestorage.app",
  messagingSenderId: "259239486173",
  appId: "1:259239486173:web:32826b7f2612dec27eb134",
  measurementId: "G-XQ1C96H71L"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
