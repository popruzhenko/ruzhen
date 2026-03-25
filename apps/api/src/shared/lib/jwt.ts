import jwt from 'jsonwebtoken';

const accessSecret = process.env.JWT_ACCESS_SECRET || 'default_access_secret';

if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET is not defined');
}

type AccesTokenPayload = {
    userId: string;
    email: string;
    role: string;
};

export function signAccesToken(payload: AccesTokenPayload) {
    return jwt.sign(payload, accessSecret, { expiresIn: '15m' });
}

export function verifyAccesToken(token: string) {
    try {
        return jwt.verify(token, accessSecret);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}
