import { Request, Response } from 'express';
import { ContactTopic } from '@prisma/client';

import { createContactMessage } from '../services/publicContact.service';

export async function createContactMessageHandler(req: Request, res: Response) {
    try {
        const message = await createContactMessage({
            name: req.body.name ?? null,
            email: req.body.email,
            topic: req.body.topic as ContactTopic,
            title: req.body.title,
            message: req.body.message,
        });

        return res.status(201).json({
            message,
        });
    } catch (error) {
        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to create contact message.',
        });
    }
}
