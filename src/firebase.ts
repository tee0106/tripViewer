import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { SheetError } from './errors'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
export const TOKEN_KEY = 'tv_g_token'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const missingEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
].filter((key) => !import.meta.env[key])

export const ready = missingEnv.length === 0
const app = ready ? initializeApp(config as Required<typeof config>) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function googleToken(force: boolean): Promise<string> {
  if (!auth) throw new SheetError('fetch')
  if (!force) {
    const cached = sessionStorage.getItem(TOKEN_KEY)
    if (cached) return cached
  }
  auth.languageCode = document.documentElement.lang || 'zh-TW'
  const provider = new GoogleAuthProvider()
  provider.addScope(SHEETS_SCOPE)
  if (force) provider.setCustomParameters({ prompt: 'consent', include_granted_scopes: 'true' })
  const result = await signInWithPopup(auth, provider)
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken || ''
  if (!token) {
    if (!force) return googleToken(true)
    throw new SheetError('auth')
  }
  sessionStorage.setItem(TOKEN_KEY, token)
  return token
}

export async function logOut() {
  sessionStorage.removeItem(TOKEN_KEY)
  if (auth) await signOut(auth)
}
