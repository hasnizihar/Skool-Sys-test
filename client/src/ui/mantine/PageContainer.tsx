import React from 'react';
import { Container, Box, ContainerProps } from '@mantine/core';

export interface PageContainerProps extends ContainerProps {
  children: React.ReactNode;
  fluid?: boolean;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  fluid = false,
  size = 'xl',
  p = { base: 'md', sm: 'lg', md: 'xl' },
  ...rest
}) => {
  return (
    <Container
      fluid={fluid}
      size={size}
      p={p}
      style={{ minHeight: '100%', width: '100%' }}
      {...rest}
    >
      <Box>{children}</Box>
    </Container>
  );
};

export default PageContainer;
