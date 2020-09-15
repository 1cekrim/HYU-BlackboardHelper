/*global chrome*/

import React, { useState, useEffect } from 'react';
import { Button } from 'react-bootstrap'
import './App.css';

function simulateNetworkRequest() {
  return new Promise((resolve) => setTimeout(resolve, 2000));
}

function LoadingButton() {
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) {
      simulateNetworkRequest().then(() => {
        setLoading(false);
      });
    }
  }, [isLoading]);

  const handleClick = () => setLoading(true);

  return (
    <Button
      variant="primary"
      disabled={isLoading}
      onClick={!isLoading ? handleClick : null}
    >
      {isLoading ? '조회중…' : '온라인 출석 조회'}
    </Button>
  );
}

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <div>
          한양대학교 블랙보드 도우미
        </div>
        <LoadingButton />
      </header>
    </div>
  );
}

export default App;
