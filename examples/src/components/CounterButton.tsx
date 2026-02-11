import React, { useState } from 'react';

interface CounterButtonProps {
  initialCount?: number;
}

export const CounterButton: React.FC<CounterButtonProps> = ({ initialCount = 0 }) => {
  const [count, setCount] = useState(initialCount);

  const handleIncrement = () => {
    setCount(count + 1);
  };

  return (
    <button onClick={handleIncrement}>
      Count: {count}
    </button>
  );
};