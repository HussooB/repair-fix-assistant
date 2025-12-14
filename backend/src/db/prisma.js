// src/db/prisma.js

import { PrismaClient } from '@prisma/client';

// Remove TypeScript type assertion — just use regular object
const globalForPrisma = global;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}