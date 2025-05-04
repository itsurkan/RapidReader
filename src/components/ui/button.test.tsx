import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from './button';

describe('Button', () => {
  it('should render the default button', () => {
    render(<Button asChild={false} />);
    const buttonElement = screen.getByRole('button');
    expect(buttonElement).toBeInTheDocument();
  });

  it('should render the children inside the button', () => {
    render(<Button asChild={false}>Test Button</Button>);
    const buttonElement = screen.getByRole('button');
    expect(buttonElement).toHaveTextContent('Test Button');
  });
});