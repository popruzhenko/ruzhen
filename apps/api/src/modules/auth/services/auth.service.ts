import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { signAccesToken } from '../../../shared/lib/jwt';
import 'dotenv/config';
import { sha256 } from '../../../shared/lib/hash';
import { generateSessionToken } from '../../../shared/lib/session-token';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function registerUser(email: string, password: string) {
    if (!email || !password) {
        throw new Error('Email and password are required');
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            role: UserRole.USER,
        },
        select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
        },
    });

    return user;
}

export async function loginUser(email: string, password: string) {
    if (!email || !password) {
        throw new Error('Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        throw new Error('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    const accessToken = signAccesToken({
        userId: user.id,
        email: user.email,
        role: user.role,
    });

    const sessionToken = generateSessionToken();
    const refreshTokenHash = sha256(sessionToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
        data: {
            userId: user.id,
            refreshTokenHash,
            expiresAt,
        },
    });

    return {
        accessToken,
        sessionToken,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
        },
    };
}

export async function getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
        },
    });
    if (!user) {
        throw new Error('User not found');
    }
    return user;
}

export async function logoutUser(userId: string) {
    await prisma.session.updateMany({
        where: {
            userId,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    return { success: true };
}
