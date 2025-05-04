export default {
  preset: 'ts-jest',
  moduleDirectories: ['node_modules', 'src'],
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
        tsconfig: 'tsconfig.json'
    }]
  },  
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1',
  },
};