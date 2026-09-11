import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const preferences = sqliteTable('preferences', { owner: text('owner').primaryKey(), topics: text('topics').notNull() });
export const articles = sqliteTable('articles', { owner: text('owner').notNull(), id: text('id').notNull(), data: text('data').notNull() }, t=>[primaryKey({columns:[t.owner,t.id]})]);
