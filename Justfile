# @cadenya/widgets-ui-react tasks

default:
    @just --list

# Compile TypeScript to dist/
build:
    npm run build

# Rebuild on change (pair with a file:-linked consumer, e.g. the widgets demo)
dev:
    npx tsc --watch

# Typecheck without emitting
typecheck:
    npm run typecheck

# Run the test suite once
test:
    npm test

# Install dependencies
install:
    npm install

# Start Storybook on http://localhost:6006 (mock backend, no credentials needed)
storybook:
    npm run storybook

# Build the static Storybook into storybook-static/
storybook-build:
    npm run build-storybook

# Typecheck stories and .storybook config
storybook-typecheck:
    npm run typecheck:storybook
