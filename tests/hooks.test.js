import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { render, fireEvent } from '@testing-library/react';
import useMemo from '../src/hooks/useMemo';
import useMergedState from '../src/hooks/useMergedState';
import useLayoutEffect from '../src/hooks/useLayoutEffect';
import useState from '../src/hooks/useState';
import useId, { resetUuid } from '../src/hooks/useId';

global.disableUseId = false;

jest.mock('react', () => {
  const react = jest.requireActual('react');

  const clone = { ...react };

  Object.defineProperty(clone, 'useId', {
    get: () => (global.disableUseId ? undefined : react.useId),
  });

  return clone;
});

describe('hooks', () => {
  it('useMemo', () => {
    const FC = ({ open, data }) => {
      const memoData = useMemo(
        () => data,
        [open, data],
        (prev, next) => next[0] && prev[1] !== next[1],
      );
      return <div>{memoData}</div>;
    };

    const { container, rerender } = render(<FC data="open" open />);
    expect(container.querySelector('div').textContent).toEqual('open');

    rerender(<FC data="again" open />);
    expect(container.querySelector('div').textContent).toEqual('again');

    rerender(<FC data="close" open={false} />);
    expect(container.querySelector('div').textContent).toEqual('again');

    rerender(<FC data="repeat" open />);
    expect(container.querySelector('div').textContent).toEqual('repeat');
  });

  describe('useMergedState', () => {
    const FC = ({ value, defaultValue }) => {
      const [val, setVal] = useMergedState(null, { value, defaultValue });
      return (
        <input
          value={val}
          onChange={e => {
            setVal(e.target.value);
          }}
        />
      );
    };

    it('still control of to undefined', () => {
      const { container, rerender } = render(<FC value="test" />);

      expect(container.querySelector('input').value).toEqual('test');

      rerender(<FC value={undefined} />);
      expect(container.querySelector('input').value).toEqual('test');
    });

    it('correct defaultValue', () => {
      const { container } = render(<FC defaultValue="test" />);

      expect(container.querySelector('input').value).toEqual('test');
    });

    it('not rerender when setState as deps', () => {
      let renderTimes = 0;

      const Test = () => {
        const [val, setVal] = useMergedState(0);

        React.useEffect(() => {
          renderTimes += 1;
          expect(renderTimes < 10).toBeTruthy();

          setVal(1);
        }, [setVal]);

        return <div>{val}</div>;
      };

      const { container } = render(<Test />);
      expect(container.firstChild.textContent).toEqual('1');
    });

    it('React 18 should not reset to undefined', () => {
      const Demo = () => {
        const [val] = useMergedState(33, { value: undefined });

        return <div>{val}</div>;
      };

      const { container } = render(
        <React.StrictMode>
          <Demo />
        </React.StrictMode>,
      );

      expect(container.querySelector('div').textContent).toEqual('33');
    });

    it('postState', () => {
      const Demo = () => {
        const [val] = useMergedState(1, { postState: v => v * 2 });

        return <div>{val}</div>;
      };

      const { container } = render(
        <React.StrictMode>
          <Demo />
        </React.StrictMode>,
      );

      expect(container.querySelector('div').textContent).toEqual('2');
    });
  });

  describe('useLayoutEffect', () => {
    const FC = ({ defaultValue }) => {
      const [val, setVal] = React.useState(defaultValue);
      const [val2, setVal2] = React.useState();
      useLayoutEffect(() => {
        setVal2(`${val}a`);
      }, [val]);
      return (
        <div>
          <input
            value={val}
            onChange={e => {
              setVal(e.target.value);
            }}
          />
          <label>{val2}</label>
        </div>
      );
    };

    it('correct effect', () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { container } = render(<FC defaultValue="test" />);
      expect(container.querySelector('label').textContent).toEqual('testa');

      fireEvent.change(container.querySelector('input'), {
        target: { value: '1' },
      });
      expect(container.querySelector('label').textContent).toEqual('1a');

      fireEvent.change(container.querySelector('input'), {
        target: { value: '2' },
      });
      expect(container.querySelector('label').textContent).toEqual('2a');

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('useState', () => {
    it('not throw', done => {
      const errorSpy = jest.spyOn(console, 'error');

      const Demo = () => {
        const [val, setValue] = useState(0);

        React.useEffect(
          () => () => {
            setTimeout(() => {
              setValue(1, true);
            }, 0);
          },
          [],
        );

        return (
          <button
            onClick={() => {
              setValue(93, true);
            }}
          >
            {val}
          </button>
        );
      };

      const { container, unmount } = render(
        <React.StrictMode>
          <Demo />
        </React.StrictMode>,
      );
      expect(container.querySelector('button').textContent).toEqual('0');

      // Update Value
      fireEvent.click(container.querySelector('button'));
      expect(container.querySelector('button').textContent).toEqual('93');

      unmount();

      setTimeout(() => {
        expect(errorSpy).not.toHaveBeenCalled();
        done();
      }, 50);
    });

    // This test no need in React 18 anymore
    it.skip('throw', done => {
      const errorSpy = jest.spyOn(console, 'error');

      const Demo = () => {
        const [val, setValue] = useState(0);

        React.useEffect(
          () => () => {
            setTimeout(() => {
              setValue(1);
            }, 0);
          },
          [],
        );

        return null;
      };

      const { unmount } = render(<Demo />);
      unmount();

      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('useId', () => {
    const Demo = ({ id } = {}) => {
      const mergedId = useId(id);
      return <div id={mergedId} className="target" />;
    };

    function matchId(container, id) {
      const ele = container.querySelector('.target');
      return expect(ele.id).toEqual(id);
    }

    it('id passed', () => {
      const { container } = render(<Demo id="bamboo" />);
      matchId(container, 'bamboo');
    });

    it('test env', () => {
      const { container } = render(<Demo />);
      matchId(container, 'test-id');
    });

    it('react useId', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const originEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // SSR
      const content = renderToString(<Demo />);
      expect(content).not.toContain('test-id');

      // Hydrate
      const holder = document.createElement('div');
      holder.innerHTML = content;
      const {} = render(<Demo />, {
        hydrate: true,
        container: holder,
      });

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      process.env.NODE_ENV = originEnv;
    });

    it('fallback of React 17 or lower', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const originEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      global.disableUseId = true;

      // SSR
      const content = renderToString(
        <React.StrictMode>
          <Demo />
        </React.StrictMode>,
      );
      expect(content).toContain('ssr-id');

      // Hydrate
      resetUuid();
      const holder = document.createElement('div');
      holder.innerHTML = content;
      const { container } = render(
        <React.StrictMode>
          <Demo />
        </React.StrictMode>,
        {
          hydrate: true,
          container: holder,
        },
      );

      matchId(container, 'rc_unique_1');

      errorSpy.mockRestore();
      process.env.NODE_ENV = originEnv;
      global.disableUseId = false;
    });
  });
});
