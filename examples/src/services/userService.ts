// Service layer - good patterns
import { UserSchema, type User } from '../schemas/userSchema';

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
