import {handleFeed} from '@/lib/api-feed';
import {resolveOrigins} from '@/lib/api-cors';

const options = () => ({allowedOrigins: resolveOrigins(process.env.ALLOWED_ORIGINS)});
export async function OPTIONS(request: Request) {return handleFeed(request, options());}
export async function GET(request: Request) {return handleFeed(request, options());}
