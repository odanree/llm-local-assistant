// Component layer - anti-patterns
import React from 'react';
import { useUser } from '../hooks/useUser';

export const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const { user, loading, error, updateUser } = useUser(userId);

  // Inline styles (anti-pattern)
  const styles = {
    container: { padding: '20px', backgroundColor: '#f5f5f5' },
    header: { fontSize: '24px', fontWeight: 'bold', color: '#333' },
    error: { color: 'red', padding: '10px', backgroundColor: '#ffe6e6' },
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={styles.error}>{String(error)}</div>;
  if (!user) return <div>No user found</div>;

  // Magic strings (anti-pattern)
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>{typeof user === 'object' && user !== null && 'name' in user ? String((user as Record<string, unknown>).name) : 'Unknown'}</h1>
      <p>Email: {typeof user === 'object' && user !== null && 'email' in user ? String((user as Record<string, unknown>).email) : 'N/A'}</p>
      <p>Age: {typeof user === 'object' && user !== null && 'age' in user ? String((user as Record<string, unknown>).age) : 'N/A'}</p>
      
      <button
        onClick={() => updateUser({ name: 'Updated Name' })}
        style={{ padding: '10px 20px', backgroundColor: 'blue', color: 'white' }}
      >
        Update
      </button>
    </div>
  );
};
