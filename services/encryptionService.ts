
// Simulates E2EE key generation and safety number computation
// In a real app, this would use window.crypto.subtle to generate ECDH keys

export const encryptionService = {
  // Generate a consistent "Safety Number" fingerprint based on user IDs
  // This simulates the visual proof of key exchange
  getSafetyNumber: async (contactId: string, currentUserId: string): Promise<string[]> => {
    const combined = [contactId, currentUserId].sort().join('-');
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    
    // Hash the IDs to get a consistent "fingerprint"
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Convert hash to a series of 5-digit blocks (similar to Signal/Telegram)
    const blocks: string[] = [];
    for (let i = 0; i < 20; i += 5) { // 4 blocks
        let num = 0;
        // Combine a few bytes to make a large number
        for (let j = 0; j < 4; j++) {
            num = (num << 8) + hashArray[i + j];
        }
        // Take the last 5 digits
        blocks.push((num % 100000).toString().padStart(5, '0'));
    }
    
    return blocks;
  },

  // Simulate graphical visualization (identicon style logic could go here)
  // For now, we return a color based on the hash
  getSecurityColor: (contactId: string): string => {
    let hash = 0;
    for (let i = 0; i < contactId.length; i++) {
      hash = contactId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
  }
};
