import { applyMiddleware, combineReducers, compose, createStore } from 'redux';
import createSagaMiddleware from 'redux-saga';
import * as sagaEffects from 'redux-saga/effects';
import {
    isFunction,
    isPlainObject,
    isString,
    extend,
    isArray,
    cloneDeep,
} from 'lodash';
import { produce } from 'immer';
import {
    loadingReducer,
    loadingReducerImmer,
    loading_name,
    ACTION_LOADINGS_REMOVE,
} from './loading.reducer';
import {
    effectStatusReducer,
    effectStatusReducerImmer,
    effectStatus_name,
    status_fail,
    status_loading,
    status_success,
    ACTION_EFFECTS_REMOVE,
} from './effectStatus.reducer';
import { logger } from './logger';
const { takeEvery, takeLatest, throttle } = sagaEffects;
const EMPTY_STATE = null;

export function createStorer(config = {}) {
    const { reducers, ...rest } = config;

    const _config = {
        initialState: {},
        onError: () => void 0,
        extraEnhancers: [],
        model: [],
        integrateLoading: false,
        effectStatusWatch: false,
        loggerMiddleware: false,
        integrateImmer: false,
        ...rest,
        separator: '/',
    };

    const app = {
        reducers: { ...reducers },
        sagaMiddleware: createSagaMiddleware(),
        namespace: [],
        config: _config,
        tasks: {},
    };
    //integrate loading
    if (app.config.integrateLoading) {
        app.reducers.loading = app.config.integrateImmer
            ? loadingReducerImmer
            : loadingReducer;
        app.namespace.push(loading_name);
    }

    if (app.config.effectStatusWatch) {
        app.reducers[effectStatus_name] = app.config.integrateImmer
            ? effectStatusReducerImmer
            : effectStatusReducer;
        app.namespace.push(effectStatus_name);
    }

    function addModel(model) {
        _addModel(app, model);
    }

    function removeModel(model) {
        _removeModel(app, model);
    }

    init(app);

    if (isArray(_config.model)) {
        _config.model.forEach((model) => {
            addModel(model);
        });
    }
    // eslint-disable-next-line
    const { replaceReducer, ...other } = app.store;
    return {
        addModel,
        removeModel,
        hasNamespace(str) {
            return app.namespace.indexOf(str) > -1;
        },
        ...other,
    };
}

// helper

/**
 *app init :createStore & rewrite handleError
 * @param app
 */
function init(app) {
    const reducer = getCombinedReducer(app),
        enhancers = getEnhancers(app);
    app.store = createStore(reducer, compose(...enhancers));
    app.handleError = function(desc) {
        const { onError } = app.config;
        if (isString(desc)) {
            onError(new Error(desc));
        } else {
            onError(desc);
        }
    };
}

/**
 * add model to app
 *
 * @param app
 * @param config
 * @param model
 * @private
 */
function _addModel(app, model) {
    assert(isPlainObject(model), 'model should be a object');
    assert(
        isString(model.namespace),
        `namespace should be string but got ${typeof namespace}`,
    );
    assert(
        app.namespace.indexOf(model.namespace) < 0,
        `The model(${model.namespace}) is already in use`,
    );
    assert(
        isPlainObject(model.reducers),
        `The reducers of model(${model.namespace}) should be object`,
    );
    assert(
        isPlainObject(model.state),
        `The state of model(${model.namespace}) should be object`,
    );

    const _model = extend(
        {
            effects: {},
            state: {},
        },
        model,
    );

    app.namespace.push(_model.namespace);

    //create reducer and replace reducer
    const _reducer = wrapReducers(app, _model);
    app.reducers = extend({}, app.reducers, { [_model.namespace]: _reducer });
    app.store.replaceReducer(getCombinedReducer(app));
    // debugger
    //create saga
    if (isPlainObject(_model.effects)) {
        const task = app.sagaMiddleware.run(createSaga(app, _model));
        app.tasks[_model.namespace] = task;
    }
}

/**
 * remove model
 *
 * @param app
 * @param config
 * @param model
 * @private
 */
function _removeModel(app, model) {
    assert(isPlainObject(model), 'model should be a object');
    const { namespace } = model;
    const index = app.namespace.indexOf(namespace);
    if (index > -1) {
        app.namespace.splice(index, 1);
    }

    const task = app.tasks[namespace];
    const reducer = app.reducers[namespace];
    if (task instanceof Object && typeof task.cancel === 'function') {
        task.cancel();
        delete app.tasks[namespace];
    }
    if (typeof reducer === 'function') {
        app.reducers[namespace] = clearState;
        app.store.replaceReducer(getCombinedReducer(app));
    }
    if (app.config.integrateLoading) {
        app.store.dispatch({
            type: ACTION_LOADINGS_REMOVE,
            payload: { namespace },
        });
    }
    if (app.config.effectStatusWatch) {
        app.store.dispatch({
            type: ACTION_EFFECTS_REMOVE,
            payload: { namespace },
        });
    }
}

/**
 * getCombinedReducer
 * @param app
 * @returns {*}
 */
function getCombinedReducer(app) {
    if (app.reducers) {
        return combineReducers(app.reducers);
    } else {
        return (state = {}) => state;
    }
}

/**
 * getEnhancers
 * @param app
 * @param config
 * @returns {Array.<*>}
 */
function getEnhancers(app) {
    const { extraEnhancers } = app.config,
        { sagaMiddleware } = app,
        devtools = [];

    if (process.env.NODE_ENV !== 'production') {
        try {
            if (
                isWindow(window) &&
                isFunction(window.__REDUX_DEVTOOLS_EXTENSION__)
            ) {
                devtools.push(
                    window.__REDUX_DEVTOOLS_EXTENSION__({ actionSanitizer }),
                );
            } else if (app.config.loggerMiddleware) {
                devtools.push(applyMiddleware(logger));
            }
        } catch (e) {
            //Ignore the error: 'window is not defined'
        }
    }
    //__REDUX_DEVTOOLS_EXTENSION__ will change the actions that created by sagamiddleware ,so i put it to the end
    return [applyMiddleware(sagaMiddleware), ...extraEnhancers].concat(
        devtools,
    );
}

/**
 * wrapReducers
 * @param app
 * @param model
 * @returns {Function}
 */
function wrapReducers(app, model) {
    const {
        config: { initialState, separator, integrateImmer },
    } = app;
    const { namespace, reducers } = model;

    const _initialState = extend(
        {},
        cloneDeep(model.state),
        isPlainObject(initialState) ? initialState[namespace] : {},
    );
    return function(state, action) {
        const _state =
            state === undefined || state === EMPTY_STATE
                ? integrateImmer
                    ? produce(
                          state === undefined || state === EMPTY_STATE
                              ? {}
                              : state,
                          (draft) => {
                              // change _initialState to readonly

                              Object.assign(draft, _initialState);
                          },
                      )
                    : _initialState
                : state;

        const { type } = action;
        const names = type.split(separator);
        const reducer = reducers[names[1]];

        if (
            names.length === 2 &&
            namespace === names[0] &&
            isFunction(reducer)
        ) {
            if (integrateImmer) {
                return produce(_state, (draft) => {
                    reducer(draft, action);
                });
            }
            return reducer(_state, action);
        }
        return _state;
    };
}

/**
 * createSaga
 * @param app
 * @param model
 * @returns {Function}
 */
function createSaga(app, model) {
    const { namespace, effects } = model;

    return function*() {
        let keys = Object.keys(effects);
        for (let key of keys) {
            yield sagaEffects.fork(
                createWatcher(namespace, key, effects[key], app),
            );
        }
    };
}

/**
 * wrapPutFn
 * @param namespace
 * @returns {{put: put}}
 */
function wrapPutFn(namespace, separator) {
    return function put(action) {
        if (isPlainObject(action)) {
            //no prefix only when action.prefix === false
            if (action.prefix === false) return sagaEffects.put(action);

            let { type } = action;
            if (isString(type)) {
                if (type.indexOf(separator) > 0) {
                    return sagaEffects.put(action);
                } else {
                    action.type = `${namespace}${separator}${type}`;
                    return sagaEffects.put(action);
                }
            } else {
                throw new Error(`action's type is not string!`);
            }
        } else {
            throw new Error('action is not a plain object!');
        }
    };
}

/**
 * createWatcher
 * @param namespace
 * @param key
 * @param effect
 * @param app
 * @returns {Function}
 */
function createWatcher(namespace, key, effect, app) {
    let type = 'takeEvery',
        time,
        fn;
    const {
        handleError,
        config: { integrateLoading, separator, effectStatusWatch },
    } = app;
    const actionType = namespace + separator + key;

    if (isFunction(effect)) {
        fn = effect;
    } else if (isArray(effect)) {
        fn = effect[0];
        type = effect[1].type || 'takeEvery';
        time = effect[1].time || 0;
    }

    const wrapper = function*(action) {
        let err;
        try {
            if (integrateLoading) {
                yield sagaEffects.put({
                    type: loading_name,
                    payload: {
                        effects: { [actionType]: true },
                    },
                });
            }

            if (effectStatusWatch) {
                yield sagaEffects.put({
                    type: effectStatus_name,
                    payload: {
                        [actionType]: {
                            status: status_loading,
                        },
                    },
                });
            }

            yield fn(action, {
                ...sagaEffects,
                put: wrapPutFn(namespace, separator),
            });
        } catch (e) {
            err = e;
        }
        if (integrateLoading) {
            yield sagaEffects.put({
                type: loading_name,
                payload: {
                    effects: { [actionType]: false },
                },
            });
        }

        if (err) {
            if (effectStatusWatch) {
                yield sagaEffects.put({
                    type: effectStatus_name,
                    payload: {
                        [actionType]: {
                            status: status_fail,
                            error: err,
                        },
                    },
                });
            }
            handleError(err);
            return;
        }
        if (effectStatusWatch) {
            yield sagaEffects.put({
                type: effectStatus_name,
                payload: {
                    [actionType]: {
                        status: status_success,
                        error: null,
                    },
                },
            });
        }
    };

    switch (type) {
        case 'takeLatest':
            return function*() {
                yield takeLatest(actionType, wrapper);
            };
        case 'throttle':
            return function*() {
                yield throttle(time, actionType, wrapper);
            };
        default:
            return function*() {
                yield takeEvery(actionType, wrapper);
            };
    }
}

function isWindow(win) {
    return typeof win === 'object' && win !== null && win.window === win;
}

function actionSanitizer(action) {
    return action.payload instanceof Object &&
        action.payload.target &&
        action.payload.type
        ? { ...action, payload: '<<EVENT>>' }
        : action;
}

function clearState() {
    return EMPTY_STATE;
}

export function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
