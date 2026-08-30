export function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongEnoughPassword(password: string) {
    return /[A-Za-z]/.test(password) && /\d/.test(password);
}