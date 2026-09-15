import {env} from 'cloudflare:workers';
import {handleSettings, type SettingsDb} from '@/lib/api-settings';
import {resolveOrigins} from '@/lib/api-cors';

const options = () => ({db: env.DB as unknown as SettingsDb | undefined, allowedOrigins: resolveOrigins(process.env.ALLOWED_ORIGINS)});
export async function OPTIONS(request: Request) {return handleSettings(request, options());}
export async function POST(request: Request) {return handleSettings(request, options());}
