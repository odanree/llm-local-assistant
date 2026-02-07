// Hook layer - needs extraction
import { useState, useEffect, useCallback } from 'react';

export const useUser = (userId: string) => {
  const [user, setUser] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filteredUsers, setFilteredUsers] = useState<unknown[]>([]);
  const [sortBy, setSortBy] = useState('name');

  // API Call 1
  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      
      // Validation inline (should be in service)
      if (!data.id || !data.email) {
        throw new Error('Invalid user data');
      }
      
      setUser(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // API Call 2
  const updateUser = useCallback(async (updates: unknown) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const updated = await response.json();
      setUser(updated);
      setError(null);
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // API Call 3
  const deleteUser = useCallback(async () => {
    if (!window.confirm('Are you sure?')) return;
    
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [userId]);

  // Filtering logic (should be in service)
  const filterAndSort = useCallback(() => {
    if (!user) return [];
    
    const filtered = [user].filter((u: unknown) => {
      if (typeof u === 'object' && u !== null && 'status' in u) {
        return (u as Record<string, unknown>).status === 'active';
      }
      return false;
    });
    
    if (sortBy === 'name') {
      filtered.sort((a: unknown, b: unknown) => {
        if (typeof a === 'object' && a !== null && 'name' in a && 
            typeof b === 'object' && b !== null && 'name' in b) {
          return String((a as Record<string, unknown>).name).localeCompare(String((b as Record<string, unknown>).name));
        }
        return 0;
      });
    } else if (sortBy === 'email') {
      filtered.sort((a: unknown, b: unknown) => {
        if (typeof a === 'object' && a !== null && 'email' in a && 
            typeof b === 'object' && b !== null && 'email' in b) {
          return String((a as Record<string, unknown>).email).localeCompare(String((b as Record<string, unknown>).email));
        }
        return 0;
      });
    } else if (sortBy === 'date') {
      filtered.sort((a: unknown, b: unknown) => {
        if (typeof a === 'object' && a !== null && 'createdAt' in a && 
            typeof b === 'object' && b !== null && 'createdAt' in b) {
          const dateA = new Date(String((a as Record<string, unknown>).createdAt)).getTime();
          const dateB = new Date(String((b as Record<string, unknown>).createdAt)).getTime();
          return dateA - dateB;
        }
        return 0;
      });
    }
    
    return filtered;
  }, [user, sortBy]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    setFilteredUsers(filterAndSort());
  }, [filterAndSort]);

  return {
    user,
    users: filteredUsers,
    loading,
    error,
    fetchUser,
    updateUser,
    deleteUser,
    setSortBy,
    sortBy,
  };
};
