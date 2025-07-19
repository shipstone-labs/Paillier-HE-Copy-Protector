#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

// Monitoring configuration
const POLL_INTERVAL = 2000; // 2 seconds
const INSTRUCTION_LIMIT = 5_000_000_000; // ICP query limit
const WARNING_THRESHOLD = 0.8; // Warn at 80% usage

// Performance history
const history = {
    operations: [],
    maxInstructions: 0,
    totalOperations: 0,
};

// vetKeys metrics
const VET_KEY_METRICS = {
    keyDerivations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    derivationTimes: [],
    averageDerivationTime: 0,
    cacheHitRate: 0,
    fallbackUses: 0,
};

async function getCanisterStats() {
    try {
        const { stdout } = await execPromise('dfx canister call paillier_poc_backend get_stats');
        
        // Parse the Candid response
        const match = stdout.match(/total_operations = ([0-9_]+).*total_instructions = ([0-9_]+).*documents_stored = ([0-9]+).*memory_used_mb = ([0-9.]+).*encryption_operations = ([0-9_]+).*comparison_operations = ([0-9_]+).*failed_operations = ([0-9_]+)/s);
        
        if (match) {
            return {
                totalOperations: parseInt(match[1].replace(/_/g, '')),
                totalInstructions: parseInt(match[2].replace(/_/g, '')),
                documentsStored: parseInt(match[3]),
                memoryUsedMb: parseFloat(match[4]),
                encryptionOps: parseInt(match[5].replace(/_/g, '')),
                comparisonOps: parseInt(match[6].replace(/_/g, '')),
                failedOps: parseInt(match[7].replace(/_/g, '')),
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function getVetKeyMetrics() {
    try {
        const { stdout } = await execPromise('dfx canister call paillier_poc_backend get_vetkd_metrics');
        
        // Parse vetKeys metrics
        const derivations = stdout.match(/key_derivations = ([0-9_]+)/);
        const hits = stdout.match(/cache_hits = ([0-9_]+)/);
        const misses = stdout.match(/cache_misses = ([0-9_]+)/);
        const fallback = stdout.match(/fallback_uses = ([0-9_]+)/);
        const totalTime = stdout.match(/total_derivation_time = ([0-9_]+)/);
        
        if (derivations) {
            VET_KEY_METRICS.keyDerivations = parseInt(derivations[1].replace(/_/g, ''));
        }
        if (hits) {
            VET_KEY_METRICS.cacheHits = parseInt(hits[1].replace(/_/g, ''));
        }
        if (misses) {
            VET_KEY_METRICS.cacheMisses = parseInt(misses[1].replace(/_/g, ''));
        }
        if (fallback) {
            VET_KEY_METRICS.fallbackUses = parseInt(fallback[1].replace(/_/g, ''));
        }
        
        // Calculate cache hit rate
        const totalCacheAccess = VET_KEY_METRICS.cacheHits + VET_KEY_METRICS.cacheMisses;
        if (totalCacheAccess > 0) {
            VET_KEY_METRICS.cacheHitRate = VET_KEY_METRICS.cacheHits / totalCacheAccess;
        }
        
        // Calculate average derivation time
        if (VET_KEY_METRICS.keyDerivations > 0 && totalTime) {
            const totalTimeMs = parseInt(totalTime[1].replace(/_/g, ''));
            VET_KEY_METRICS.averageDerivationTime = totalTimeMs / VET_KEY_METRICS.keyDerivations;
        }
        
        return VET_KEY_METRICS;
    } catch (error) {
        console.error('Failed to get vetKeys metrics:', error);
        return null;
    }
}

async function getHealthCheck() {
    try {
        const { stdout } = await execPromise('dfx canister call paillier_poc_backend health_check');
        return stdout.trim().replace(/[()\"]/g, '');
    } catch (error) {
        return 'Error';
    }
}

function formatNumber(num) {
    return num.toLocaleString();
}

function getProgressBar(percentage, width = 20) {
    const filled = Math.round(percentage * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    let color = colors.green;
    if (percentage > 0.9) color = colors.red;
    else if (percentage > 0.7) color = colors.yellow;
    
    return `${color}[${bar}]${colors.reset} ${(percentage * 100).toFixed(1)}%`;
}

function getCacheEfficiencyBar(rate, width = 20) {
    const filled = Math.round(rate * width);
    const empty = width - filled;
    const bar = '▓'.repeat(filled) + '░'.repeat(empty);
    
    let color = colors.green;
    if (rate < 0.5) color = colors.red;
    else if (rate < 0.7) color = colors.yellow;
    
    return `${color}[${bar}]${colors.reset} ${(rate * 100).toFixed(1)}%`;
}

function clearScreen() {
    process.stdout.write('\x1Bc');
}

function displayDashboard(stats, health, vetKeyMetrics) {
    clearScreen();
    
    console.log(`${colors.magenta}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.magenta}║      Paillier POC with vetKeys - Performance Monitor          ║${colors.reset}`);
    console.log(`${colors.magenta}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();
    
    // Health status
    console.log(`${colors.cyan}Status:${colors.reset} ${health}`);
    console.log();
    
    // Statistics
    console.log(`${colors.yellow}═══ Operations ═══${colors.reset}`);
    console.log(`Total Operations:     ${formatNumber(stats.totalOperations)}`);
    console.log(`Encryption Ops:       ${formatNumber(stats.encryptionOps)}`);
    console.log(`Comparison Ops:       ${formatNumber(stats.comparisonOps)}`);
    console.log(`Failed Operations:    ${formatNumber(stats.failedOps)}`);
    console.log();
    
    // vetKeys Performance
    if (vetKeyMetrics) {
        console.log(`${colors.yellow}═══ vetKeys Performance ═══${colors.reset}`);
        console.log(`Key Derivations:      ${formatNumber(vetKeyMetrics.keyDerivations)}`);
        console.log(`Cache Hits:           ${formatNumber(vetKeyMetrics.cacheHits)}`);
        console.log(`Cache Misses:         ${formatNumber(vetKeyMetrics.cacheMisses)}`);
        console.log(`Fallback Uses:        ${formatNumber(vetKeyMetrics.fallbackUses)}`);
        
        // Cache efficiency visualization
        console.log(`\nCache Hit Rate:       ${getCacheEfficiencyBar(vetKeyMetrics.cacheHitRate)}`);
        
        if (vetKeyMetrics.averageDerivationTime > 0) {
            console.log(`Avg Derivation Time:  ${vetKeyMetrics.averageDerivationTime.toFixed(2)}ms`);
        }
        
        // Warnings
        if (vetKeyMetrics.cacheHitRate < 0.7 && vetKeyMetrics.keyDerivations > 10) {
            console.log(`${colors.yellow}⚠️  Low cache hit rate - consider increasing cache size${colors.reset}`);
        }
        if (vetKeyMetrics.fallbackUses > 0) {
            console.log(`${colors.yellow}⚠️  Fallback mode used ${vetKeyMetrics.fallbackUses} times${colors.reset}`);
        }
    }
    
    // Resource usage
    console.log(`\n${colors.yellow}═══ Resource Usage ═══${colors.reset}`);
    console.log(`Documents Stored:     ${stats.documentsStored}`);
    console.log(`Memory Used:          ${stats.memoryUsedMb.toFixed(2)} MB`);
    console.log(`Total Instructions:   ${formatNumber(stats.totalInstructions)}`);
    
    // Performance analysis
    if (stats.totalOperations > 0) {
        const avgInstructionsPerOp = Math.round(stats.totalInstructions / stats.totalOperations);
        console.log(`\n${colors.yellow}═══ Performance Analysis ═══${colors.reset}`);
        console.log(`Avg Instructions/Op:  ${formatNumber(avgInstructionsPerOp)}`);
        
        // Estimate remaining capacity
        if (history.operations.length > 0) {
            const recentOp = history.operations[history.operations.length - 1];
            if (recentOp.instructions > 0) {
                const opsUntilLimit = Math.floor(INSTRUCTION_LIMIT / recentOp.instructions);
                console.log(`Est. Ops until limit: ${formatNumber(opsUntilLimit)}`);
                
                // Progress bar for instruction usage
                const usagePercentage = recentOp.instructions / INSTRUCTION_LIMIT;
                console.log(`\nLast Op Usage: ${getProgressBar(usagePercentage)}`);
            }
        }
    }
    
    // Recent operations
    if (history.operations.length > 0) {
        console.log(`\n${colors.yellow}═══ Recent Operations (Last 5) ═══${colors.reset}`);
        const recent = history.operations.slice(-5).reverse();
        recent.forEach((op, i) => {
            const timestamp = new Date(op.timestamp).toLocaleTimeString();
            const keyInfo = op.usedCache ? '(cached)' : '(derived)';
            console.log(`${timestamp} | ${op.type.padEnd(10)} | ${formatNumber(op.instructions)} inst ${keyInfo}`);
        });
    }
    
    // Footer
    console.log(`\n${colors.magenta}Press Ctrl+C to exit${colors.reset}`);
    console.log(`Refreshing every ${POLL_INTERVAL/1000} seconds...`);
}

async function detectNewOperation(prevStats, currentStats, prevVetKeys, currentVetKeys) {
    if (!prevStats) return null;
    
    const instructionDiff = currentStats.totalInstructions - prevStats.totalInstructions;
    if (instructionDiff > 0) {
        let type = 'unknown';
        if (currentStats.encryptionOps > prevStats.encryptionOps) {
            type = 'encrypt';
        } else if (currentStats.comparisonOps > prevStats.comparisonOps) {
            type = 'compare';
        }
        
        // Check if cache was used
        const usedCache = currentVetKeys && prevVetKeys && 
            (currentVetKeys.cacheHits > prevVetKeys.cacheHits);
        
        return {
            type,
            instructions: instructionDiff,
            timestamp: Date.now(),
            usedCache,
        };
    }
    return null;
}

async function monitor() {
    let prevStats = null;
    let prevVetKeys = null;
    
    setInterval(async () => {
        const [stats, vetKeyMetrics, health] = await Promise.all([
            getCanisterStats(),
            getVetKeyMetrics(),
            getHealthCheck()
        ]);
        
        if (stats) {
            // Detect new operations
            const newOp = await detectNewOperation(prevStats, stats, prevVetKeys, vetKeyMetrics);
            if (newOp) {
                history.operations.push(newOp);
                history.totalOperations++;
                if (newOp.instructions > history.maxInstructions) {
                    history.maxInstructions = newOp.instructions;
                }
                
                // Keep only last 10 operations
                if (history.operations.length > 10) {
                    history.operations.shift();
                }
                
                // Alert if approaching limits
                if (newOp.instructions > INSTRUCTION_LIMIT * WARNING_THRESHOLD) {
                    console.log(`\n${colors.red}⚠️  WARNING: Operation used ${(newOp.instructions / INSTRUCTION_LIMIT * 100).toFixed(1)}% of instruction limit!${colors.reset}`);
                }
            }
            
            displayDashboard(stats, health, vetKeyMetrics);
            prevStats = stats;
            prevVetKeys = vetKeyMetrics;
        } else {
            clearScreen();
            console.log(`${colors.red}Error: Could not connect to canister${colors.reset}`);
            console.log('Make sure the canister is deployed and dfx is running');
        }
    }, POLL_INTERVAL);
}

// Main
console.log(`${colors.magenta}Starting Paillier POC with vetKeys Performance Monitor...${colors.reset}`);
console.log('Connecting to canister...\n');

// Start monitoring
monitor();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Shutting down monitor...${colors.reset}`);
    
    // Show final summary
    if (VET_KEY_METRICS.keyDerivations > 0) {
        console.log(`\n${colors.cyan}Final vetKeys Summary:${colors.reset}`);
        console.log(`Total Key Derivations: ${VET_KEY_METRICS.keyDerivations}`);
        console.log(`Final Cache Hit Rate: ${(VET_KEY_METRICS.cacheHitRate * 100).toFixed(1)}%`);
        if (VET_KEY_METRICS.fallbackUses > 0) {
            console.log(`Fallback Mode Uses: ${VET_KEY_METRICS.fallbackUses}`);
        }
    }
    
    process.exit(0);
});