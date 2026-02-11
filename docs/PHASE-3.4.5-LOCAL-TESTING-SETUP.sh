#!/bin/bash
# PHASE-3.4.5-LOCAL-TESTING-SETUP.sh
# Quick setup script for local testing

set -e

echo "🚀 Phase 3.4.5 Local Testing Setup"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create test project
TEST_DIR="$HOME/test-llm-local-v2.0"
echo -e "${BLUE}Creating test project at $TEST_DIR${NC}"

mkdir -p "$TEST_DIR"/{src,src/schemas,src/services,src/hooks,src/components}
cd "$TEST_DIR"

# Initialize git
if [ ! -d .git ]; then
  git init
  echo "Initialized git repo"
fi

# Create package.json
cat > package.json << 'EOF'
{
  "name": "test-llm-local",
  "version": "1.0.0",
  "description": "Test project for v2.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "test": "vitest"
  }
}
EOF
echo -e "${GREEN}✓ Created package.json${NC}"

# Create userSchema.ts (GOOD)
cat > src/schemas/userSchema.ts << 'EOF'
// Schema layer - perfect structure
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().positive(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const validateUser = (data: any) => {
  return UserSchema.parse(data);
};
EOF
echo -e "${GREEN}✓ Created userSchema.ts${NC}"

# Create userService.ts (GOOD)
cat > src/services/userService.ts << 'EOF'
// Service layer - good patterns
import { UserSchema, User } from '../schemas/userSchema';

export class UserService {
  async getUser(id: string): Promise<User> {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch user: ${response.statusText}`);
    
    const data = await response.json();
    return UserSchema.parse(data);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) throw new Error(`Failed to update user: ${response.statusText}`);
    
    const data = await response.json();
    return UserSchema.parse(data);
  }

  async deleteUser(id: string): Promise<void> {
    const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Failed to delete user: ${response.statusText}`);
  }
}

export const userService = new UserService();
EOF
echo -e "${GREEN}✓ Created userService.ts${NC}"

# Create useUser.ts (FAT HOOK - needs refactoring)
cat > src/hooks/useUser.ts << 'EOF'
// Hook layer - needs extraction
import { useState, useEffect, useCallback } from 'react';

export const useUser = (userId: string) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
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
  const updateUser = useCallback(async (updates: any) => {
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
    
    const filtered = [user].filter(u => u.status === 'active');
    
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'email') {
      filtered.sort((a, b) => a.email.localeCompare(b.email));
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
EOF
echo -e "${GREEN}✓ Created useUser.ts (fat hook for testing)${NC}"

# Create UserProfile.tsx (BAD PATTERNS)
cat > src/components/UserProfile.tsx << 'EOF'
// Component layer - anti-patterns
import React from 'react';
import { useUser } from '../hooks/useUser';

export const UserProfile: React.FC<any> = ({ userId }) => {
  const { user, loading, error, updateUser } = useUser(userId);

  // Inline styles (anti-pattern)
  const styles = {
    container: { padding: '20px', backgroundColor: '#f5f5f5' },
    header: { fontSize: '24px', fontWeight: 'bold', color: '#333' },
    error: { color: 'red', padding: '10px', backgroundColor: '#ffe6e6' },
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!user) return <div>No user found</div>;

  // Magic strings (anti-pattern)
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>{user.name}</h1>
      <p>Email: {user.email}</p>
      <p>Age: {user.age}</p>
      
      <button
        onClick={() => updateUser({ name: 'Updated Name' })}
        style={{ padding: '10px 20px', backgroundColor: 'blue', color: 'white' }}
      >
        Update
      </button>
    </div>
  );
};
EOF
echo -e "${GREEN}✓ Created UserProfile.tsx (anti-patterns for testing)${NC}"

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.DS_Store
EOF
echo -e "${GREEN}✓ Created .gitignore${NC}"

# Create .vscode/settings.json
mkdir -p .vscode
cat > .vscode/settings.json << 'EOF'
{
  "files.exclude": {
    "node_modules": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
EOF
echo -e "${GREEN}✓ Created .vscode/settings.json${NC}"

echo ""
echo -e "${BLUE}===== SETUP COMPLETE =====${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Open the test project in VS Code:"
echo -e "   ${GREEN}code $TEST_DIR${NC}"
echo ""
echo "2. Open the LLM Local Assistant extension (press F5 in the main llm-local-assistant folder)"
echo ""
echo "3. In VS Code, open the integrated terminal in the test project"
echo ""
echo "4. Start testing with these commands:"
echo -e "   ${GREEN}/refactor src/hooks/useUser.ts${NC}"
echo -e "   ${GREEN}/rate-architecture${NC}"
echo -e "   ${GREEN}/suggest-patterns${NC}"
echo -e "   ${GREEN}/design-system User Profile${NC}"
echo ""
echo "5. Use the comprehensive testing guide:"
echo -e "   ${GREEN}PHASE-3.4.5-LOCAL-TESTING-GUIDE.md${NC}"
echo ""
echo -e "${YELLOW}Test project files:${NC}"
ls -la "$TEST_DIR/src/"
echo ""
echo -e "${GREEN}✨ Ready to test v2.0!${NC}"
