import { bookAccess, unlockHtml } from './book-access';
import { ledgerHtml } from './ledger-html';
export const dynamic = 'force-dynamic';
export async function GET(req:Request) {
  return new Response(await bookAccess(req)?ledgerHtml:unlockHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'" } });
}
