import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient, UserRole, type User } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { signAccesToken } from '../../../shared/lib/jwt';
import { sha256 } from '../../../shared/lib/hash';
import { generateSessionToken } from '../../../shared/lib/session-token';

import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID is not defined');
}

if (!googleClientSecret) {
    throw new Error('GOOGLE_CLIENT_SECRET is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const googleClient = new OAuth2Client({
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    redirectUri: 'postmessage',
});

type AuthSessionUser = Pick<User, 'id' | 'email' | 'role' | 'createdAt'>;

async function createAuthSession(user: AuthSessionUser) {
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

export async function registerUser(email: string, password: string) {
    if (!email || !password) {
        throw new Error('Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
        where: {
            email: normalizedEmail,
        },
    });

    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            email: normalizedEmail,
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

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: {
            email: normalizedEmail,
        },
    });

    if (!user || !user.passwordHash) {
        throw new Error('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    return createAuthSession({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
    });
}

export async function loginWithGoogle(code: string) {
    if (!code) {
        throw new Error('Google authorization code is required');
    }

    const { tokens } = await googleClient.getToken(code);

    if (!tokens.id_token) {
        throw new Error('Google id token was not returned');
    }

    const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: googleClientId,
    });

    const payload = ticket.getPayload();

    if (!payload) {
        throw new Error('Invalid Google id token');
    }

    const googleId = payload.sub;
    const email = payload.email;
    const isEmailVerified = payload.email_verified;

    if (!googleId || !email || !isEmailVerified) {
        throw new Error('Google account email is not verified');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUserByGoogleId = await prisma.user.findUnique({
        where: {
            googleId,
        },
    });

    if (existingUserByGoogleId) {
        if (existingUserByGoogleId.role !== UserRole.USER) {
            throw new Error('Google login is not allowed for admin accounts');
        }

        return createAuthSession({
            id: existingUserByGoogleId.id,
            email: existingUserByGoogleId.email,
            role: existingUserByGoogleId.role,
            createdAt: existingUserByGoogleId.createdAt,
        });
    }

    const existingUserByEmail = await prisma.user.findUnique({
        where: {
            email: normalizedEmail,
        },
    });

    if (existingUserByEmail) {
        if (existingUserByEmail.role !== UserRole.USER) {
            throw new Error('Google login is not allowed for admin accounts');
        }

        const linkedUser = await prisma.user.update({
            where: {
                id: existingUserByEmail.id,
            },
            data: {
                googleId,
            },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        return createAuthSession(linkedUser);
    }

    const user = await prisma.user.create({
        data: {
            email: normalizedEmail,
            googleId,
            passwordHash: null,
            role: UserRole.USER,
        },
        select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
        },
    });

    return createAuthSession(user);
}

export async function getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
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
