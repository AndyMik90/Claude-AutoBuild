#!/usr/bin/env python3
"""
Test Fixtures - Sample Data Constants
======================================

Sample code snippets and data used across multiple test files.
These are separated from conftest.py to allow direct imports.
"""

# Sample React component code
SAMPLE_REACT_COMPONENT = '''import React from 'react';
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;
'''

SAMPLE_REACT_WITH_HOOK = '''import React from 'react';
import { useState } from 'react';
import { useAuth } from './hooks/useAuth';

function App() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();

  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;
'''

# Sample Python module code
SAMPLE_PYTHON_MODULE = '''"""Sample Python module."""
import os
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''

SAMPLE_PYTHON_WITH_NEW_IMPORT = '''"""Sample Python module."""
import os
import logging
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''

SAMPLE_PYTHON_WITH_NEW_FUNCTION = '''"""Sample Python module."""
import os
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

def new_function():
    """A new function."""
    return 42

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''
