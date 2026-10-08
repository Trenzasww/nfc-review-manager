'use strict';
/*
  CONFIGURACIÓN DE SINCRONIZACIÓN EN LA NUBE (Firebase) — OPCIONAL
  ──────────────────────────────────────────────────────────────
  Sin esto, la app funciona 100% igual pero SOLO guarda en este dispositivo
  (localStorage). Si querés que tus datos se vean iguales en el celu y en
  la PC, seguí estos pasos (gratis, 5 minutos):

  1. Entrá a https://console.firebase.google.com/ con tu cuenta de Google.
  2. "Agregar proyecto" → poné un nombre (ej: "nfc-manager") → crear.
  3. En el panel del proyecto: ícono </> ("Agregar app web") → registrá la app
     (no hace falta Hosting) → te va a mostrar un objeto "firebaseConfig".
  4. Copiá esos valores y pegalos abajo, reemplazando los que dicen "".
  5. En el menú izquierdo: Compilación → Firestore Database → "Crear base de
     datos" → modo producción → elegí una región (ej: us-east1) → Habilitar.
  6. Adentro de Firestore, pestaña "Reglas", pegá esto y publicá:

     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /nfc_manager/{doc} {
           allow read, write: if request.auth != null;
         }
       }
     }

  7. Menú izquierdo: Compilación → Authentication → "Comenzar" → pestaña
     "Sign-in method" → habilitá "Anónimo".

  Listo. Guardá este archivo y volvé a abrir la web: a partir de ahí todo
  se sincroniza solo entre todos tus dispositivos.
*/

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

window.CLOUD_SYNC_ENABLED = !!(window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId);
