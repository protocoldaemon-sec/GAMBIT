/**
 * Hidden Markov Model (HMM) for Market Regime Detection
 * Identifies hidden market states from observable price/volume data
 * 
 * Detects regime shifts for adaptive strategy selection
 */

export class HiddenMarkovModel {
  constructor(config = {}) {
    this.numStates = config.numStates || 3; // Bull, Bear, Sideways
    this.numObservations = config.numObservations || 5; // Discretized returns
    
    // State names for interpretation
    this.stateNames = config.stateNames || ['BEAR', 'SIDEWAYS', 'BULL'];
    
    // Initialize transition matrix (A) - probability of state transitions
    this.transitionMatrix = this.initializeTransitionMatrix();
    
    // Initialize emission matrix (B) - probability of observations given state
    this.emissionMatrix = this.initializeEmissionMatrix();
    
    // Initial state distribution (π)
    this.initialDistribution = new Array(this.numStates).fill(1 / this.numStates);
    
    // Training parameters
    this.maxIterations = config.maxIterations || 100;
    this.convergenceThreshold = config.convergenceThreshold || 1e-6;
    
    // History for continuous learning
    this.trainingHistory = [];
  }

  initializeTransitionMatrix() {
    // Initialize with slight persistence (states tend to persist)
    const matrix = [];
    for (let i = 0; i < this.numStates; i++) {
      const row = [];
      for (let j = 0; j < this.numStates; j++) {
        if (i === j) {
          row.push(0.7); // 70% chance to stay in same state
        } else {
          row.push(0.3 / (this.numStates - 1)); // Split remaining among others
        }
      }
      matrix.push(row);
    }
    return matrix;
  }

  initializeEmissionMatrix() {
    // Initialize emission probabilities
    // Rows: states, Cols: observations (discretized returns)
    const matrix = [];
    for (let i = 0; i < this.numStates; i++) {
      const row = [];
      for (let j = 0; j < this.numObservations; j++) {
        // Bear state: more likely to emit negative returns
        // Bull state: more likely to emit positive returns
        // Sideways: more likely to emit near-zero returns
        if (i === 0) { // BEAR
          row.push(j < this.numObservations / 2 ? 0.3 : 0.1);
        } else if (i === 2) { // BULL
          row.push(j >= this.numObservations / 2 ? 0.3 : 0.1);
        } else { // SIDEWAYS
          const mid = Math.floor(this.numObservations / 2);
          row.push(j === mid ? 0.4 : 0.15);
        }
      }
      // Normalize
      const sum = row.reduce((a, b) => a + b, 0);
      matrix.push(row.map(v => v / sum));
    }
    return matrix;
  }

  /**
   * Discretize continuous returns into observation indices
   */
  discretizeReturns(returns, bins = null) {
    bins = bins || [-0.05, -0.02, 0.02, 0.05]; // Default bins
    
    return returns.map(r => {
      for (let i = 0; i < bins.length; i++) {
        if (r < bins[i]) return i;
      }
      return bins.length; // Highest bin
    });
  }

  /**
   * Forward Algorithm - Calculate P(observations | model)
   */
  forward(observations) {
    const T = observations.length;
    const alpha = [];
    
    // Initialize
    alpha[0] = [];
    for (let i = 0; i < this.numStates; i++) {
      alpha[0][i] = this.initialDistribution[i] * this.emissionMatrix[i][observations[0]];
    }
    
    // Recursion
    for (let t = 1; t < T; t++) {
      alpha[t] = [];
      for (let j = 0; j < this.numStates; j++) {
        let sum = 0;
        for (let i = 0; i < this.numStates; i++) {
          sum += alpha[t - 1][i] * this.transitionMatrix[i][j];
        }
        alpha[t][j] = sum * this.emissionMatrix[j][observations[t]];
      }
      
      // Scaling to prevent underflow
      const scale = alpha[t].reduce((a, b) => a + b, 0);
      if (scale > 0) {
        alpha[t] = alpha[t].map(v => v / scale);
      }
    }
    
    return alpha;
  }

  /**
   * Backward Algorithm
   */
  backward(observations) {
    const T = observations.length;
    const beta = new Array(T);
    
    // Initialize
    beta[T - 1] = new Array(this.numStates).fill(1);
    
    // Recursion
    for (let t = T - 2; t >= 0; t--) {
      beta[t] = [];
      for (let i = 0; i < this.numStates; i++) {
        let sum = 0;
        for (let j = 0; j < this.numStates; j++) {
          sum += this.transitionMatrix[i][j] * 
                 this.emissionMatrix[j][observations[t + 1]] * 
                 beta[t + 1][j];
        }
        beta[t][i] = sum;
      }
      
      // Scaling
      const scale = beta[t].reduce((a, b) => a + b, 0);
      if (scale > 0) {
        beta[t] = beta[t].map(v => v / scale);
      }
    }
    
    return beta;
  }

  /**
   * Viterbi Algorithm - Find most likely state sequence
   */
  viterbi(observations) {
    const T = observations.length;
    const delta = [];
    const psi = [];
    
    // Initialize
    delta[0] = [];
    psi[0] = [];
    for (let i = 0; i < this.numStates; i++) {
      delta[0][i] = Math.log(this.initialDistribution[i]) + 
                    Math.log(this.emissionMatrix[i][observations[0]] + 1e-10);
      psi[0][i] = 0;
    }
    
    // Recursion
    for (let t = 1; t < T; t++) {
      delta[t] = [];
      psi[t] = [];
      for (let j = 0; j < this.numStates; j++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        for (let i = 0; i < this.numStates; i++) {
          const val = delta[t - 1][i] + Math.log(this.transitionMatrix[i][j] + 1e-10);
          if (val > maxVal) {
            maxVal = val;
            maxIdx = i;
          }
        }
        delta[t][j] = maxVal + Math.log(this.emissionMatrix[j][observations[t]] + 1e-10);
        psi[t][j] = maxIdx;
      }
    }
    
    // Backtrack
    const states = new Array(T);
    states[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]));
    
    for (let t = T - 2; t >= 0; t--) {
      states[t] = psi[t + 1][states[t + 1]];
    }
    
    return {
      states,
      stateNames: states.map(s => this.stateNames[s]),
      probability: Math.exp(Math.max(...delta[T - 1])),
    };
  }

  /**
   * Baum-Welch Algorithm - Train HMM parameters
   */
  train(observations, maxIterations = null) {
    maxIterations = maxIterations || this.maxIterations;
    let prevLogLikelihood = -Infinity;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const alpha = this.forward(observations);
      const beta = this.backward(observations);
      const T = observations.length;
      
      // Calculate gamma and xi
      const gamma = [];
      const xi = [];
      
      for (let t = 0; t < T; t++) {
        gamma[t] = [];
        const denom = alpha[t].reduce((sum, a, i) => sum + a * beta[t][i], 0);
        
        for (let i = 0; i < this.numStates; i++) {
          gamma[t][i] = (alpha[t][i] * beta[t][i]) / (denom + 1e-10);
        }
        
        if (t < T - 1) {
          xi[t] = [];
          for (let i = 0; i < this.numStates; i++) {
            xi[t][i] = [];
            for (let j = 0; j < this.numStates; j++) {
              xi[t][i][j] = (alpha[t][i] * this.transitionMatrix[i][j] * 
                           this.emissionMatrix[j][observations[t + 1]] * 
                           beta[t + 1][j]) / (denom + 1e-10);
            }
          }
        }
      }
      
      // Update parameters
      // Initial distribution
      for (let i = 0; i < this.numStates; i++) {
        this.initialDistribution[i] = gamma[0][i];
      }
      
      // Transition matrix
      for (let i = 0; i < this.numStates; i++) {
        const gammaSum = gamma.slice(0, -1).reduce((sum, g) => sum + g[i], 0);
        for (let j = 0; j < this.numStates; j++) {
          const xiSum = xi.reduce((sum, x) => sum + x[i][j], 0);
          this.transitionMatrix[i][j] = xiSum / (gammaSum + 1e-10);
        }
      }
      
      // Emission matrix
      for (let i = 0; i < this.numStates; i++) {
        const gammaSum = gamma.reduce((sum, g) => sum + g[i], 0);
        for (let k = 0; k < this.numObservations; k++) {
          let obsSum = 0;
          for (let t = 0; t < T; t++) {
            if (observations[t] === k) {
              obsSum += gamma[t][i];
            }
          }
          this.emissionMatrix[i][k] = obsSum / (gammaSum + 1e-10);
        }
      }
      
      // Check convergence
      const logLikelihood = Math.log(alpha[T - 1].reduce((a, b) => a + b, 0) + 1e-10);
      if (Math.abs(logLikelihood - prevLogLikelihood) < this.convergenceThreshold) {
        console.log(`[HMM] Converged at iteration ${iter}`);
        break;
      }
      prevLogLikelihood = logLikelihood;
    }
    
    this.trainingHistory.push({
      timestamp: new Date().toISOString(),
      observations: observations.length,
      logLikelihood: prevLogLikelihood,
    });
    
    return this;
  }

  /**
   * Predict current regime
   */
  predictRegime(recentReturns) {
    const observations = this.discretizeReturns(recentReturns);
    const result = this.viterbi(observations);
    
    // Get current state (last in sequence)
    const currentState = result.states[result.states.length - 1];
    const currentRegime = this.stateNames[currentState];
    
    // Calculate regime probabilities using forward algorithm
    const alpha = this.forward(observations);
    const lastAlpha = alpha[alpha.length - 1];
    const sum = lastAlpha.reduce((a, b) => a + b, 0);
    const probabilities = lastAlpha.map(a => a / sum);
    
    return {
      currentRegime,
      currentState,
      probabilities: Object.fromEntries(
        this.stateNames.map((name, i) => [name, probabilities[i]])
      ),
      confidence: Math.max(...probabilities),
      stateSequence: result.stateNames.slice(-10), // Last 10 states
    };
  }

  /**
   * Predict regime transition probabilities
   */
  predictTransition(currentState) {
    const transitions = {};
    for (let j = 0; j < this.numStates; j++) {
      transitions[this.stateNames[j]] = this.transitionMatrix[currentState][j];
    }
    return transitions;
  }

  /**
   * Export model parameters for persistence
   */
  exportModel() {
    return {
      numStates: this.numStates,
      numObservations: this.numObservations,
      stateNames: this.stateNames,
      transitionMatrix: this.transitionMatrix,
      emissionMatrix: this.emissionMatrix,
      initialDistribution: this.initialDistribution,
      trainingHistory: this.trainingHistory,
    };
  }

  /**
   * Import model parameters
   */
  importModel(params) {
    this.numStates = params.numStates;
    this.numObservations = params.numObservations;
    this.stateNames = params.stateNames;
    this.transitionMatrix = params.transitionMatrix;
    this.emissionMatrix = params.emissionMatrix;
    this.initialDistribution = params.initialDistribution;
    this.trainingHistory = params.trainingHistory || [];
    return this;
  }
}

export default HiddenMarkovModel;
