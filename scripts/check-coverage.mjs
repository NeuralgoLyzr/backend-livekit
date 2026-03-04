import fs from 'node:fs';
import path from 'node:path';

const COVERAGE_SUMMARY_PATH = path.resolve('coverage/coverage-summary.json');

const thresholds = {
    lines: Number(process.env.COVERAGE_MIN_LINES ?? '70'),
    statements: Number(process.env.COVERAGE_MIN_STATEMENTS ?? '70'),
    functions: Number(process.env.COVERAGE_MIN_FUNCTIONS ?? '70'),
    branches: Number(process.env.COVERAGE_MIN_BRANCHES ?? '65'),
};

function readCoverageSummary() {
    if (!fs.existsSync(COVERAGE_SUMMARY_PATH)) {
        throw new Error(
            `Coverage summary not found at ${COVERAGE_SUMMARY_PATH}. Run "pnpm test:coverage:ci" first.`
        );
    }

    const raw = fs.readFileSync(COVERAGE_SUMMARY_PATH, 'utf8');
    return JSON.parse(raw);
}

function getPct(summary, key) {
    const value = summary?.total?.[key]?.pct;
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Missing coverage percentage for "${key}" in coverage summary.`);
    }
    return value;
}

function main() {
    const summary = readCoverageSummary();
    const metrics = {
        lines: getPct(summary, 'lines'),
        statements: getPct(summary, 'statements'),
        functions: getPct(summary, 'functions'),
        branches: getPct(summary, 'branches'),
    };

    const failures = Object.entries(metrics).filter(([metric, pct]) => pct < thresholds[metric]);

    console.log('Coverage thresholds:');
    for (const [metric, threshold] of Object.entries(thresholds)) {
        console.log(`- ${metric}: ${threshold}%`);
    }

    console.log('Coverage actuals:');
    for (const [metric, pct] of Object.entries(metrics)) {
        console.log(`- ${metric}: ${pct.toFixed(2)}%`);
    }

    if (failures.length > 0) {
        console.error('Coverage gate failed:');
        for (const [metric, pct] of failures) {
            console.error(`- ${metric}: ${pct.toFixed(2)}% < ${thresholds[metric]}%`);
        }
        process.exit(1);
    }

    console.log('Coverage gate passed.');
}

main();
