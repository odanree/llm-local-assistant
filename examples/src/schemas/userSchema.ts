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

export const validateUser = (data: unknown) => {
  return UserSchema.parse(data);
};
