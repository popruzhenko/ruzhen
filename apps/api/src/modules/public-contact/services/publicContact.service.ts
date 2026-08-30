import 'dotenv/config';
import { PrismaClient, ContactTopic } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { prisma } from '../../../shared/lib/prismaClient';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

export interface CreateContactMessageInput {
    name?: string | null;
    email: string;
    topic: ContactTopic;
    title: string;
    message: string;
}

const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const contactTopics = Object.values(ContactTopic);

export function validateContactMessageInput(input: CreateContactMessageInput) {
    const errors: string[] = [];

    const trimmedEmail = input.email?.trim();
    const trimmedTitle = input.title?.trim();
    const trimmedMessage = input.message?.trim();

    if (!trimmedEmail) {
        errors.push('Email is required.');
    } else if (!isValidEmail(trimmedEmail)) {
        errors.push('Email is invalid.');
    }

    if (!contactTopics.includes(input.topic)) {
        errors.push('Topic is invalid.');
    }

    if (!trimmedTitle) {
        errors.push('Title is required.');
    } else if (trimmedTitle.length < 4) {
        errors.push('Title must be at least 4 characters.');
    }

    if (!trimmedMessage) {
        errors.push('Message is required.');
    } else if (trimmedMessage.length < 20) {
        errors.push('Message must be at least 20 characters.');
    }

    return errors;
}

export async function createContactMessage(input: CreateContactMessageInput) {
    const errors = validateContactMessageInput(input);

    if (errors.length > 0) {
        throw new Error(errors.join(' '));
    }

    return prisma.contactMessage.create({
        data: {
            name: input.name?.trim() || null,
            email: input.email.trim(),
            topic: input.topic,
            title: input.title.trim(),
            message: input.message.trim(),
        },
        select: {
            id: true,
            topic: true,
            title: true,
            createdAt: true,
        },
    });
}
