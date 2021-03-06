import {
    createStorer,
    isStatusFail,
    isStatusSuccess,
    isStatusLoading,
    isStatusUninitialized,
    getStatus,
} from '../src/index';
import {
    model1,
    namespace as model1Namespace,
    actionCreators,
    actionTypes,
} from './model-test';
import {
    model as model2,
    actionCreators as model2ActionCreators,
    actionTypes as model2ActionTypes,
} from './model-test-immer.js';
import { isFunction, uniqWith, isEqual } from 'lodash';
import { createStore } from 'redux';
import { cloneDeep } from 'lodash';

const model3 = cloneDeep(model1);
model3.namespace = 'model3';

let err = null,
    errorCount = 0;

const appDemo = createStorer({
    integrateLoading: true,
    onError: (error) => {
        (err = error), errorCount++;
    },
});

const getType = (s) => Object.prototype.toString.call(s);

test('Methods check', () => {
    const store = createStore((state = {}) => state);

    for (let each in store) {
        if (each !== 'replaceReducer') {
            // console.log(each)
            expect(getType(store[each]) === getType(appDemo[each])).toBe(true);
        }
    }
    expect(isFunction(appDemo.addModel)).toBe(true);
});

appDemo.addModel(model1);

test('Get initial state', () => {
    const state = appDemo.getState();
    expect(state[model1Namespace].count).toBe(1);
});

test("Dispatch action from effects(prefix action's type)", () => {
    appDemo.dispatch(actionCreators.dispachAction({ value: 'success' }));
    expect(appDemo.getState()[model1Namespace].dispachAction).toBe('success');
});

test('Dispatch action(effects)', (done) => {
    appDemo.dispatch({
        type: model1Namespace + '/changeCount',
        payload: {
            count: 3,
        },
    });
    // loading
    expect(
        appDemo.getState().loading.effects[`${model1Namespace}/changeCount`],
    ).toBe(true);
    expect(appDemo.getState()[model1Namespace].count).toBe(1);
    appDemo.dispatch(actionCreators.takeLatest());
    expect(appDemo.getState()[model1Namespace].takeLatestSuccess).toBe(true);
    appDemo.dispatch(actionCreators.throttle());
    expect(appDemo.getState()[model1Namespace].throttleSuccess).toBe(true);
    appDemo.dispatch(actionCreators.dispachActionWithCompleteType());
    expect(
        appDemo.getState()[model1Namespace]
            .dispachActionWithCompleteTypeSuccess,
    ).toBe(true);
    setTimeout(() => {
        expect(appDemo.getState()[model1Namespace].count).toBe(3);
        expect(
            appDemo.getState().loading.effects[
                `${model1Namespace}/changeCount`
            ],
        ).toBe(false);
        done();
    }, 101);
});

test('dispatch action(reducer)', () => {
    appDemo.dispatch({
        type: model1Namespace + '/updateState',
        payload: {
            sum: 9,
        },
    });
    expect(appDemo.getState()[model1Namespace].sum).toBe(9);
});

test('onError', () => {
    appDemo.dispatch({
        type: model1Namespace + '/throwError',
        payload: {
            error: 'error1',
        },
    });
    expect(err.message).toBe('error1');
});

test('onError (async)', (done) => {
    appDemo.dispatch({
        type: model1Namespace + '/throwError2',
        payload: {
            error: 'error2',
        },
    });
    setTimeout(() => {
        expect(err.message).toBe('error2');
        done();
    }, 101);
});

test('CreateStorer with initialState and model ', () => {
    const app = createStorer({
        initialState: {
            [model1Namespace]: {
                name: 'jack',
            },
        },
        model: [model1],
    });

    expect(app.getState()[model1Namespace].name).toBe('jack');
    expect(app.getState()[model1Namespace].count).toBe(1);
});

test('CreateStorer with reducers', () => {
    const app = createStorer({
        initialState: {
            [model1Namespace]: {
                name: 'jack',
            },
        },
        reducers: {
            route: (state = { location: '/path' }, action) => {
                return state;
            },
        },
        model: [model1],
    });
    expect(app.getState().route.location).toBe('/path');
    expect(app.getState()[model1Namespace].name).toBe('jack');
    expect(app.getState()[model1Namespace].count).toBe(1);
});

test('CreateStorer with effectStatusWatch', (done) => {
    const app = createStorer({
        initialState: {
            [model1Namespace]: {
                name: 'jack',
            },
        },
        reducers: {
            route: (state = { location: '/path' }, action) => {
                return state;
            },
        },
        model: [model1],
        effectStatusWatch: true,
    });
    const status = [];
    expect(app.getState().route.location).toBe('/path');
    expect(app.getState()[model1Namespace].name).toBe('jack');
    expect(app.getState()[model1Namespace].count).toBe(1);
    app.subscribe(() => {
        const state = app.getState();
        status.push(state._effectStatus[model1Namespace + '/changeCount']);
    });
    expect(isStatusUninitialized(app.getState(), actionTypes.changeCount)).toBe(
        true,
    );
    app.dispatch(actionCreators.changeCount({ count: 3 }));
    expect(isStatusLoading(app.getState(), actionTypes.changeCount)).toBe(true);

    setTimeout(() => {
        // console.log(status)
        const s = uniqWith(status, isEqual);
        const stateCurrent = app.getState();
        // console.log(s)
        expect(s[0]).toBe(undefined);
        expect(s[1].status).toBe('loading');
        expect(s[2].status).toBe('success');
        expect(isStatusSuccess(app.getState(), actionTypes.changeCount)).toBe(
            true,
        );
        expect(
            stateCurrent._effectStatus[model1Namespace + '/changeCount'] ===
                getStatus(stateCurrent, model1Namespace + '/changeCount'),
        ).toBe(true);
        expect(getStatus(stateCurrent, model1Namespace + '/none')).toEqual({});

        done();
    }, 1000);
});

test('CreateStorer with effectStatusWatch ----error', (done) => {
    const app = createStorer({
        initialState: {
            [model1Namespace]: {
                name: 'jack',
            },
        },
        reducers: {
            route: (state = { location: '/path' }, action) => {
                return state;
            },
        },
        model: [model1],
        effectStatusWatch: true,
        // loggerMiddleware:true,
    });
    const status = [];
    expect(app.getState().route.location).toBe('/path');
    expect(app.getState()[model1Namespace].name).toBe('jack');
    expect(app.getState()[model1Namespace].count).toBe(1);
    app.subscribe(() => {
        const state = app.getState();
        status.push(state._effectStatus[model1Namespace + '/throwError2']);
    });
    expect(isStatusUninitialized(app.getState(), actionTypes.throwError2)).toBe(
        true,
    );
    app.dispatch(actionCreators.throwError2({ error: 3 }));
    // console.log(app.getState());
    expect(isStatusLoading(app.getState(), actionTypes.throwError2)).toBe(true);

    setTimeout(() => {
        // console.log(status)
        const s = uniqWith(status, isEqual);
        // console.log(s)
        expect(s[0]).toBe(undefined);
        expect(s[1].status).toBe('loading');
        expect(s[2].status).toBe('fail');
        expect(s[2].error).toBe(3);

        expect(isStatusFail(app.getState(), actionTypes.throwError2)).toBe(
            true,
        );
        done();
    }, 1000);
});

test('addModel', () => {
    const storer = createStorer();

    expect(() => {
        storer.addModel();
    }).toThrow();
    expect(() => {
        storer.addModel({});
    }).toThrow();
    expect(() => {
        storer.addModel({ namespace: 'asdfasdf' });
    }).toThrow();
    expect(() => {
        storer.addModel({ namespace: 'asdfasdf', state: {} });
    }).toThrow();
});

test('RemoveModel', () => {
    const storer = createStorer({
        model: [model1, model3],
        effectStatusWatch: true,
        integrateLoading: true,
    });

    console.log(storer.getState());
    expect(storer.getState()[model1Namespace].name).toBe('rose');

    storer.dispatch(actionCreators.dispachAction({ value: 'success' }));
    expect(storer.getState()[model1Namespace].dispachAction).toBe('success');

    storer.dispatch(actionCreators.updateState({ name: 'success2' }));
    expect(storer.getState()[model1Namespace].name).toBe('success2');
    storer.dispatch(actionCreators.changeCount({ count: '333' }));
    expect(isStatusLoading(storer.getState(), actionTypes.changeCount)).toBe(
        true,
    );
    expect(storer.getState().loading.effects[actionTypes.changeCount]).toBe(
        true,
    );
    storer.dispatch({
        type: `${model3.namespace}/changeCount`,
        payload: { count: '333' },
    });

    storer.removeModel(model1);
    expect(isStatusLoading(storer.getState(), actionTypes.changeCount)).toBe(
        false,
    );
    expect(storer.getState().loading.effects[actionTypes.changeCount]).toBe(
        undefined,
    );
    expect(storer.getState()[model1Namespace]).toEqual(null);
    // console.log(storer.getState());
    storer.addModel(model1);

    expect(storer.getState()[model1Namespace].name).toBe('rose');

    const storer2 = createStorer({
        model: [model2,model3],
        integrateImmer: true,
        effectStatusWatch: true,
        integrateLoading: true,
    });
    storer2.dispatch(model2ActionCreators.changeCount({ count: '333' }));
    expect(
        isStatusLoading(storer2.getState(), model2ActionTypes.changeCount),
    ).toBe(true);
    expect(
        storer2.getState().loading.effects[model2ActionTypes.changeCount],
    ).toBe(true);
    storer2.dispatch({
        type: `${model3.namespace}/changeCount`,
        payload: { count: '333' },
    });

    storer2.removeModel(model2);
    expect(
        isStatusLoading(storer2.getState(), model2ActionTypes.changeCount),
    ).toBe(false);
    expect(
        storer2.getState().loading.effects[model2ActionTypes.changeCount],
    ).toBe(undefined);
});

test('hasNamespace', () => {
    const storer = createStorer({
        integrateLoading: true,
        model: [model1],
    });
    expect(storer.hasNamespace('loading')).toBe(true);
    expect(storer.hasNamespace(model1Namespace)).toBe(true);
    expect(storer.hasNamespace('aasdf')).toBe(false);
});
