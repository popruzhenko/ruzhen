export function generateClusterHumanId(sequenceIndex = 0): string {
    const now = new Date();

    const year = String(now.getFullYear()).slice(2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const sequence = String(sequenceIndex + 1).padStart(3, '0');

    return `RZ-${year}${month}${day}-${hours}${minutes}-${sequence}`;
}
